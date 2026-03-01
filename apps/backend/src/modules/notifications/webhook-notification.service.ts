import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

@Injectable()
export class WebhookNotificationService {
  private readonly logger = new Logger(WebhookNotificationService.name);

  constructor(private readonly config: ConfigService) {}

  async sendWebhook(webhookUrl: string, payload: Record<string, any>): Promise<void> {
    try {
      await this.postJson(webhookUrl, payload);
      this.logger.log(`Webhook sent to ${webhookUrl}`);
    } catch (err: any) {
      this.logger.error(`Webhook failed for ${webhookUrl}: ${err.message}`);
      throw err;
    }
  }

  async sendSlack(webhookUrl: string, text: string, color?: string): Promise<void> {
    const payload: any = { text };
    if (color) {
      payload.attachments = [{ color, text }];
      payload.text = undefined;
    }
    return this.sendWebhook(webhookUrl, payload);
  }

  async sendTeams(webhookUrl: string, title: string, text: string): Promise<void> {
    return this.sendWebhook(webhookUrl, {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: title,
      themeColor: '0076D7',
      sections: [{ activityTitle: title, activityText: text }],
    });
  }

  async testWebhook(url: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.sendWebhook(url, {
        text: 'SwarmUI webhook test',
        timestamp: new Date().toISOString(),
      });
      return { success: true, message: 'Webhook test sent successfully' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  private postJson(urlStr: string, payload: Record<string, any>): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const parsedUrl = new URL(urlStr);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 10000,
      };
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const req = lib.request(options, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          resolve();
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout')); });
      req.write(body);
      req.end();
    });
  }
}
