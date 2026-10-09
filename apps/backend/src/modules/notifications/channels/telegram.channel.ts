import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import {
  AlarmPayload, SnapshotPayload, ChannelAdapter, ChannelResult, ChannelFieldSchema,
  severityEmoji, fmtTs, formatTargetLine, formatSnapshotText,
} from './channel.interface';

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
    try {
      const text = this.formatMessage(alarm, snapshot);
      await this.post(config.botToken, {
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      return { success: true, latencyMs: Date.now() - started };
    } catch (err: any) {
      this.logger.warn(`Telegram send failed: ${err.message}`);
      return { success: false, error: err.message, latencyMs: Date.now() - started };
    }
  }

  async test(config: TelegramConfig): Promise<{ success: boolean; error?: string }> {
    try {
      await this.post(config.botToken, {
        chat_id: config.chatId,
        text: '✅ <b>SwarmUI Test</b>\nNotification channel is working.',
        parse_mode: 'HTML',
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
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

  private post(token: string, payload: Record<string, any>): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
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
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
          else {
            let msg = `HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(data);
              if (parsed?.description) msg += `: ${parsed.description}`;
            } catch { /* ignore */ }
            reject(new Error(msg));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Telegram API timeout')); });
      req.write(body);
      req.end();
    });
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
