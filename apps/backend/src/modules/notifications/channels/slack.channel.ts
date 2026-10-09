import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import { URL } from 'url';
import {
  AlarmPayload, SnapshotPayload, ChannelAdapter, ChannelResult, ChannelFieldSchema,
  severityEmoji, fmtTs, formatTargetLine, formatSnapshotText,
} from './channel.interface';

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
    try {
      const blocks = this.buildBlocks(alarm, snapshot);
      if (config.webhookUrl) {
        await this.postJson(config.webhookUrl, { blocks });
      } else {
        await this.postJson('https://slack.com/api/chat.postMessage', {
          channel: config.channelId,
          blocks,
        }, { Authorization: `Bearer ${config.botToken}` });
      }
      return { success: true, latencyMs: Date.now() - started };
    } catch (err: any) {
      this.logger.warn(`Slack send failed: ${err.message}`);
      return { success: false, error: err.message, latencyMs: Date.now() - started };
    }
  }

  async test(config: SlackConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = { text: ':white_check_mark: SwarmUI test notification — channel is working.' };
      if (config.webhookUrl) {
        await this.postJson(config.webhookUrl, payload);
      } else {
        await this.postJson('https://slack.com/api/chat.postMessage', {
          channel: config.channelId,
          text: payload.text,
        }, { Authorization: `Bearer ${config.botToken}` });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
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

  private postJson(urlStr: string, payload: Record<string, any>, extraHeaders: Record<string, string> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const u = new URL(urlStr);
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
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            // slack.com/api/* returns 200 OK even for API errors — check `ok`.
            try {
              const parsed = JSON.parse(data);
              if (parsed && parsed.ok === false) return reject(new Error(parsed.error || 'Slack API error'));
            } catch { /* webhook returns plain "ok" */ }
            resolve();
          } else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Slack timeout')); });
      req.write(body);
      req.end();
    });
  }
}
