import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import { URL } from 'url';
import {
  AlarmPayload, SnapshotPayload, ChannelAdapter, ChannelResult, ChannelTestResult, ChannelFieldSchema,
  severityEmoji, fmtTs, formatTargetLine, formatSnapshotText,
} from './channel.interface';

interface HttpTranscriptResponse {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface SlackConfig {
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
}

@Injectable()
export class SlackChannel implements ChannelAdapter<SlackConfig> {
  private readonly logger = new Logger(SlackChannel.name);
  readonly type = 'slack' as const;

  schema(): ChannelFieldSchema[] {
    return [
      { key: 'webhookUrl', label: 'Incoming Webhook URL', type: 'url',
        placeholder: 'https://hooks.slack.com/services/…',
        help: 'Create an incoming webhook in Slack. Simpler option, no scopes needed.' },
      { key: 'botToken', label: 'Bot Token (alternative)', type: 'password', secret: true,
        placeholder: 'xoxb-…', help: 'Alternative to webhook. Requires chat:write scope.' },
      { key: 'channelId', label: 'Channel ID (bot token only)', type: 'text',
        placeholder: 'C0123ABC', help: 'Required when using a bot token.' },
    ];
  }

  validate(c: SlackConfig): string | null {
    if (!c?.webhookUrl && !c?.botToken) return 'Either webhookUrl or botToken is required';
    if (c?.botToken && !c?.channelId) return 'channelId is required when using botToken';
    if (c?.webhookUrl && !/^https:\/\/hooks\.slack\.com\//.test(c.webhookUrl)) return 'webhookUrl must start with https://hooks.slack.com/';
    return null;
  }

  mask(c: SlackConfig) {
    return {
      type: this.type,
      mode: c?.webhookUrl ? 'webhook' : 'bot',
      channelId: c?.channelId,
      webhookHint: c?.webhookUrl ? `…${c.webhookUrl.slice(-6)}` : undefined,
      botTokenHint: c?.botToken ? `…${c.botToken.slice(-4)}` : undefined,
    };
  }

  async send(alarm: AlarmPayload, snapshot: SnapshotPayload, config: SlackConfig): Promise<ChannelResult> {
    const started = Date.now();
    const transcript: string[] = [];
    try {
      const blocks = this.buildBlocks(alarm, snapshot);
      const res = config.webhookUrl
        ? await this.postJson(config.webhookUrl, { blocks }, {}, transcript)
        : await this.postJson('https://slack.com/api/chat.postMessage', { channel: config.channelId, blocks }, { Authorization: `Bearer ${config.botToken}` }, transcript);
      const info = this.summarize(res, !!config.webhookUrl);
      if (!info.ok) return { success: false, error: info.error, info: info.summary, transcript, latencyMs: Date.now() - started };
      return { success: true, info: info.summary, transcript, latencyMs: Date.now() - started };
    } catch (err: any) {
      this.logger.warn(`Slack send failed: ${err.message}`);
      return { success: false, error: err.message, transcript, latencyMs: Date.now() - started };
    }
  }

  async test(config: SlackConfig): Promise<ChannelTestResult> {
    const transcript: string[] = [];
    try {
      const payload = { text: ':white_check_mark: SwarmUI test notification — channel is working.' };
      const res = config.webhookUrl
        ? await this.postJson(config.webhookUrl, payload, {}, transcript)
        : await this.postJson('https://slack.com/api/chat.postMessage', { channel: config.channelId, text: payload.text }, { Authorization: `Bearer ${config.botToken}` }, transcript);
      const info = this.summarize(res, !!config.webhookUrl);
      if (!info.ok) return { success: false, error: info.error, info: info.summary, transcript };
      return { success: true, info: info.summary, transcript };
    } catch (err: any) {
      return { success: false, error: err.message, transcript };
    }
  }

  private summarize(res: HttpTranscriptResponse, isWebhook: boolean) {
    const summary: Record<string, any> = { httpStatus: res.status, mode: isWebhook ? 'webhook' : 'bot' };
    let parsed: any;
    try { parsed = JSON.parse(res.body); } catch { parsed = { _raw: res.body.slice(0, 500) }; }
    summary.response = parsed;
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}`, summary };
    }
    if (!isWebhook && parsed?.ok === false) {
      return { ok: false, error: `Slack API error: ${parsed.error || 'unknown'}`, summary };
    }
    // Webhook response is plain "ok" or JSON — treat 2xx as success.
    return { ok: true as const, error: undefined, summary };
  }

  private buildBlocks(a: AlarmPayload, s: SnapshotPayload) {
    const emoji = severityEmoji(a.severity);
    const header = `${emoji} ${a.ruleName} — ${a.status === 'resolved' ? 'RESOLVED' : 'FIRING'}`;
    const text = [
      `*Severity:* ${a.severity}`,
      `*Value:* ${Number(a.value).toFixed(2)} (threshold ${a.threshold})`,
      `*Target:* ${formatTargetLine(a) || '-'}`,
      `*Time:* ${fmtTs(a.firedAt)}`,
    ].join('\n');
    const snap = formatSnapshotText(s);
    const blocks: any[] = [
      { type: 'header', text: { type: 'plain_text', text: header } },
      { type: 'section', text: { type: 'mrkdwn', text } },
    ];
    if (snap) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '```' + snap + '```' } });
    }
    return blocks;
  }

  private postJson(urlStr: string, payload: Record<string, any>, extraHeaders: Record<string, string> = {}, transcript?: string[]): Promise<HttpTranscriptResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const u = new URL(urlStr);
      const redactedHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries({ 'Content-Type': 'application/json', ...extraHeaders })) {
        redactedHeaders[k] = /^authorization$/i.test(k) ? 'Bearer ***' : v;
      }
      transcript?.push(`→ POST ${u.protocol}//${u.hostname}${u.pathname}${u.search || ''}`);
      transcript?.push(`→ headers ${JSON.stringify(redactedHeaders)}`);
      transcript?.push(`→ body ${body.length > 500 ? body.slice(0, 500) + '…' : body}`);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        port: u.port || 443,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...extraHeaders,
        },
        timeout: 10_000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          transcript?.push(`← HTTP ${res.statusCode} ${res.statusMessage || ''}`);
          transcript?.push(`← body ${data.length > 500 ? data.slice(0, 500) + '…' : data}`);
          resolve({ status: res.statusCode || 0, statusText: res.statusMessage || '', headers: res.headers, body: data });
        });
      });
      req.on('error', (e) => { transcript?.push(`× socket error ${e.message}`); reject(e); });
      req.on('timeout', () => { req.destroy(); transcript?.push('× timeout after 10s'); reject(new Error('Slack timeout')); });
      req.write(body);
      req.end();
    });
  }
}
