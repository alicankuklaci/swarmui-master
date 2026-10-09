import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  AlarmPayload, SnapshotPayload, ChannelAdapter, ChannelResult, ChannelFieldSchema,
  severityEmoji, fmtTs, formatTargetLine, formatSnapshotText,
} from './channel.interface';

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  from: string;
  to: string[];
}

@Injectable()
export class EmailChannel implements ChannelAdapter<EmailConfig> {
  private readonly logger = new Logger(EmailChannel.name);
  readonly type = 'email' as const;

  schema(): ChannelFieldSchema[] {
    return [
      { key: 'smtpHost', label: 'SMTP Host', type: 'text', required: true, placeholder: 'smtp.gmail.com' },
      { key: 'smtpPort', label: 'SMTP Port', type: 'number', required: true, placeholder: '587' },
      { key: 'smtpUser', label: 'SMTP User', type: 'text', placeholder: 'user@example.com' },
      { key: 'smtpPass', label: 'SMTP Password', type: 'password', secret: true },
      { key: 'smtpSecure', label: 'Use TLS (port 465)', type: 'select', options: [
        { value: 'false', label: 'No (STARTTLS on 587)' },
        { value: 'true', label: 'Yes (implicit TLS on 465)' },
      ] },
      { key: 'from', label: 'From Address', type: 'text', required: true, placeholder: 'alerts@example.com' },
      { key: 'to', label: 'Recipients (comma or newline separated)', type: 'multi-text', required: true },
    ];
  }

  validate(c: EmailConfig): string | null {
    if (!c?.smtpHost) return 'smtpHost required';
    if (!c?.smtpPort) return 'smtpPort required';
    if (!c?.from) return 'from required';
    if (!c?.to || !c.to.length) return 'at least one recipient required';
    return null;
  }

  mask(c: EmailConfig) {
    return {
      type: this.type,
      smtpHost: c?.smtpHost,
      smtpPort: c?.smtpPort,
      smtpUser: c?.smtpUser,
      from: c?.from,
      to: c?.to,
      hasPassword: !!c?.smtpPass,
    };
  }

  async send(alarm: AlarmPayload, snapshot: SnapshotPayload, config: EmailConfig): Promise<ChannelResult> {
    const started = Date.now();
    try {
      const transporter = this.buildTransporter(config);
      const subject = this.buildSubject(alarm);
      await transporter.sendMail({
        from: config.from,
        to: config.to.join(', '),
        subject,
        text: this.buildText(alarm, snapshot),
        html: this.buildHtml(alarm, snapshot),
      });
      return { success: true, latencyMs: Date.now() - started };
    } catch (err: any) {
      this.logger.warn(`Email send failed: ${err.message}`);
      return { success: false, error: err.message, latencyMs: Date.now() - started };
    }
  }

  async test(config: EmailConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const transporter = this.buildTransporter(config);
      await transporter.sendMail({
        from: config.from,
        to: config.to.join(', '),
        subject: '[SwarmUI] Test notification',
        text: 'This is a SwarmUI test notification. The channel is configured correctly.',
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private buildTransporter(c: EmailConfig) {
    return nodemailer.createTransport({
      host: c.smtpHost,
      port: Number(c.smtpPort) || 587,
      secure: Boolean(c.smtpSecure) || Number(c.smtpPort) === 465,
      auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
    });
  }

  private buildSubject(a: AlarmPayload): string {
    const emoji = severityEmoji(a.severity);
    const word = a.status === 'resolved' ? 'RESOLVED' : 'FIRING';
    return `${emoji} [SwarmUI] ${word}: ${a.ruleName}`;
  }

  private buildText(a: AlarmPayload, s: SnapshotPayload): string {
    const lines = [
      `${severityEmoji(a.severity)} ${a.ruleName} — ${a.status === 'resolved' ? 'RESOLVED' : 'FIRING'}`,
      `Severity: ${a.severity}`,
      `Value: ${Number(a.value).toFixed(2)} (threshold ${a.threshold})`,
      `Target: ${formatTargetLine(a) || '-'}`,
      `Time: ${fmtTs(a.firedAt)}`,
      '',
      formatSnapshotText(s),
    ];
    return lines.join('\n');
  }

  private buildHtml(a: AlarmPayload, s: SnapshotPayload): string {
    const colour = a.severity === 'critical' ? '#dc2626' : (a.severity === 'warning' ? '#d97706' : '#2563eb');
    const snap = formatSnapshotText(s).replace(/\n/g, '<br/>');
    return `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;line-height:1.5;max-width:640px;margin:0 auto;">
        <div style="background:${colour};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">${escapeHtml(a.ruleName)} — ${a.status === 'resolved' ? 'RESOLVED' : 'FIRING'}</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Severity: ${a.severity}</p>
        </div>
        <div style="background:#f9fafb;padding:16px 20px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:0;">
          <p><strong>Value:</strong> ${Number(a.value).toFixed(2)} (threshold ${a.threshold})</p>
          <p><strong>Target:</strong> <code>${escapeHtml(formatTargetLine(a) || '-')}</code></p>
          <p><strong>Time:</strong> ${escapeHtml(fmtTs(a.firedAt))}</p>
          ${snap ? `<pre style="background:#111827;color:#f3f4f6;padding:12px;border-radius:6px;overflow-x:auto;">${snap}</pre>` : ''}
        </div>
      </div>
    `;
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
