import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(smtpConfig?: any): nodemailer.Transporter {
    const host = smtpConfig?.host || this.config.get('SMTP_HOST');
    const port = smtpConfig?.port || this.config.get<number>('SMTP_PORT', 587);
    const user = smtpConfig?.user || this.config.get('SMTP_USER');
    const pass = smtpConfig?.pass || this.config.get('SMTP_PASS');

    if (!host) throw new Error('SMTP not configured');

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  async sendEmail(opts: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    smtpConfig?: any;
  }): Promise<void> {
    try {
      const transporter = this.getTransporter(opts.smtpConfig);
      const from = this.config.get('SMTP_FROM', 'SwarmUI <noreply@swarmui.local>');
      await transporter.sendMail({
        from,
        to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      this.logger.log(`Email sent to ${opts.to}: ${opts.subject}`);
    } catch (err: any) {
      this.logger.error(`Email send failed: ${err.message}`);
      throw err;
    }
  }

  async testSmtp(smtpConfig: any, testEmail: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.sendEmail({
        to: testEmail,
        subject: 'SwarmUI SMTP Test',
        text: 'SMTP configuration is working correctly.',
        smtpConfig,
      });
      return { success: true, message: 'Test email sent successfully' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
