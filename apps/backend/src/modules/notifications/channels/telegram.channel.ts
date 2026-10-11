import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
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

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

@Injectable()
export class TelegramChannel implements ChannelAdapter<TelegramConfig> {
  private readonly logger = new Logger(TelegramChannel.name);
  readonly type = 'telegram' as const;

  schema(): ChannelFieldSchema[] {
    return [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true, secret: true,
        placeholder: '123456:ABC-DEF…', help: 'Create a bot with @BotFather and paste its token here.' },
      { key: 'chatId', label: 'Chat ID', type: 'text', required: true,
        placeholder: '-1001234567890 or 123456789',
        help: 'Negative for groups/channels, positive for private chats. Use @userinfobot to find yours.' },
    ];
  }

  validate(c: TelegramConfig): string | null {
    if (!c?.botToken || !c.botToken.includes(':')) return 'Bot token looks invalid';
    if (!c?.chatId) return 'Chat ID is required';
    return null;
  }

  mask(c: TelegramConfig) {
    const token = c?.botToken || '';
    return {
      type: this.type,
      chatId: c?.chatId,
      botTokenHint: token.length > 4 ? `…${token.slice(-4)}` : '',
    };
  }

  async send(alarm: AlarmPayload, snapshot: SnapshotPayload, config: TelegramConfig): Promise<ChannelResult> {
    const started = Date.now();
    const transcript: string[] = [];
    try {
      const text = this.formatMessage(alarm, snapshot);
      const res = await this.post(config.botToken, {
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }, transcript);
      const info = this.summarize(res, config.chatId);
      if (!info.ok) {
        return { success: false, error: info.error, info: info.summary, transcript, latencyMs: Date.now() - started };
      }
      return { success: true, info: info.summary, transcript, latencyMs: Date.now() - started };
    } catch (err: any) {
      this.logger.warn(`Telegram send failed: ${err.message}`);
      return { success: false, error: err.message, transcript, latencyMs: Date.now() - started };
    }
  }

  async test(config: TelegramConfig): Promise<ChannelTestResult> {
    const transcript: string[] = [];
    try {
      const res = await this.post(config.botToken, {
        chat_id: config.chatId,
        text: '✅ <b>SwarmUI Test</b>\nNotification channel is working.',
        parse_mode: 'HTML',
      }, transcript);
      const info = this.summarize(res, config.chatId);
      if (!info.ok) return { success: false, error: info.error, info: info.summary, transcript };
      return { success: true, info: info.summary, transcript };
    } catch (err: any) {
      return { success: false, error: err.message, transcript };
    }
  }

  /** Telegram returns `{ ok: true | false, description, result }` even on 2xx. */
  private summarize(res: HttpTranscriptResponse, chatId: string) {
    const summary: Record<string, any> = {
      httpStatus: res.status,
      chatId,
    };
    let parsed: any;
    try { parsed = JSON.parse(res.body); } catch { parsed = { _raw: res.body.slice(0, 500) }; }
    summary.response = parsed;
    const ok = res.status >= 200 && res.status < 300 && parsed?.ok === true;
    const error = ok ? undefined : (parsed?.description || `HTTP ${res.status}`);
    return { ok, error, summary };
  }

  private formatMessage(a: AlarmPayload, s: SnapshotPayload): string {
    const emoji = severityEmoji(a.severity);
    const statusWord = a.status === 'resolved' ? 'RESOLVED' : 'FIRING';
    const header = `${emoji} <b>${escapeHtml(a.ruleName)}</b> — ${statusWord}`;
    const lines = [
      header,
      `Severity: <code>${a.severity}</code>`,
      `Value: <code>${Number(a.value).toFixed(2)}</code> (threshold <code>${a.threshold}</code>)`,
      `Target: <code>${escapeHtml(formatTargetLine(a) || '-')}</code>`,
      `Time: <code>${escapeHtml(fmtTs(a.firedAt))}</code>`,
    ];
    const snap = formatSnapshotText(s);
    if (snap) lines.push('', '<pre>' + escapeHtml(snap) + '</pre>');
    return lines.join('\n');
  }

  private post(token: string, payload: Record<string, any>, transcript?: string[]): Promise<HttpTranscriptResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const path = `/bot${token}/sendMessage`;
      const redactedPath = `/bot${maskToken(token)}/sendMessage`;
      transcript?.push(`→ POST https://api.telegram.org${redactedPath}`);
      transcript?.push(`→ body ${JSON.stringify({ ...payload, text: truncate(payload.text, 200) })}`);
      const req = https.request({
        hostname: 'api.telegram.org',
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10_000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          transcript?.push(`← HTTP ${res.statusCode} ${res.statusMessage || ''}`);
          transcript?.push(`← body ${truncate(data, 500)}`);
          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: res.headers,
            body: data,
          });
        });
      });
      req.on('error', (e) => { transcript?.push(`× socket error ${e.message}`); reject(e); });
      req.on('timeout', () => { req.destroy(); transcript?.push('× timeout after 10s'); reject(new Error('Telegram API timeout')); });
      req.write(body);
      req.end();
    });
  }
}

function maskToken(t: string): string {
  if (!t) return '';
  if (t.length <= 8) return '***';
  return `${t.slice(0, 4)}***${t.slice(-4)}`;
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…(+${s.length - n} chars)` : s;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
