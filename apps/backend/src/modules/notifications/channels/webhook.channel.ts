import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  AlarmPayload, SnapshotPayload, ChannelAdapter, ChannelResult, ChannelTestResult, ChannelFieldSchema,
} from './channel.interface';

interface HttpTranscriptResponse {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  /** Template string with {alarm.*} and {snapshot.*} tokens. Omit for raw JSON. */
  bodyTemplate?: string;
}

@Injectable()
export class WebhookChannel implements ChannelAdapter<WebhookConfig> {
  private readonly logger = new Logger(WebhookChannel.name);
  readonly type = 'webhook' as const;

  schema(): ChannelFieldSchema[] {
    return [
      { key: 'url', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://…' },
      { key: 'method', label: 'HTTP Method', type: 'select',
        options: [
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
        ],
      },
      { key: 'headers', label: 'Extra Headers (JSON)', type: 'textarea',
        placeholder: '{"X-API-Key": "..."}',
        help: 'JSON object of header key→value pairs. Secrets here are stored encrypted.',
        secret: true,
      },
      { key: 'bodyTemplate', label: 'Body Template', type: 'textarea',
        placeholder: '{"text":"{alarm.ruleName} fired at {alarm.firedAt}"}',
        help: 'Use {alarm.ruleName}, {alarm.severity}, {alarm.value}, {snapshot.nodeState.cpuPct} etc. Omit for a raw JSON dump of the alarm.' },
    ];
  }

  validate(c: WebhookConfig): string | null {
    if (!c?.url) return 'url is required';
    try { new URL(c.url); } catch { return 'url is not valid'; }
    if (c.headers && typeof c.headers !== 'object') return 'headers must be an object';
    return null;
  }

  mask(c: WebhookConfig) {
    return {
      type: this.type,
      urlHost: safeHost(c?.url),
      method: c?.method || 'POST',
      headerKeys: Object.keys(c?.headers || {}),
      hasBodyTemplate: !!c?.bodyTemplate,
    };
  }

  async send(alarm: AlarmPayload, snapshot: SnapshotPayload, config: WebhookConfig): Promise<ChannelResult> {
    const started = Date.now();
    const transcript: string[] = [];
    try {
      const body = this.buildBody(alarm, snapshot, config);
      const res = await this.request(config.url, config.method || 'POST', body, config.headers || {}, transcript);
      const info = this.summarize(res);
      if (!info.ok) return { success: false, error: info.error, info: info.summary, transcript, latencyMs: Date.now() - started };
      return { success: true, info: info.summary, transcript, latencyMs: Date.now() - started };
    } catch (err: any) {
      this.logger.warn(`Webhook send failed: ${err.message}`);
      return { success: false, error: err.message, transcript, latencyMs: Date.now() - started };
    }
  }

  async test(config: WebhookConfig): Promise<ChannelTestResult> {
    const transcript: string[] = [];
    try {
      const body = JSON.stringify({ text: 'SwarmUI webhook test', ts: new Date().toISOString() });
      const res = await this.request(config.url, config.method || 'POST', body, config.headers || {}, transcript);
      const info = this.summarize(res);
      if (!info.ok) return { success: false, error: info.error, info: info.summary, transcript };
      return { success: true, info: info.summary, transcript };
    } catch (err: any) {
      return { success: false, error: err.message, transcript };
    }
  }

  private summarize(res: HttpTranscriptResponse) {
    const summary: Record<string, any> = { httpStatus: res.status };
    try { summary.response = JSON.parse(res.body); } catch { summary.response = res.body.slice(0, 500); }
    const ok = res.status >= 200 && res.status < 300;
    return { ok, error: ok ? undefined : `HTTP ${res.status}: ${res.body.slice(0, 200)}`, summary };
  }

  private buildBody(a: AlarmPayload, s: SnapshotPayload, c: WebhookConfig): string {
    if (!c.bodyTemplate) {
      return JSON.stringify({ alarm: a, snapshot: s });
    }
    const context = { alarm: a as any, snapshot: s as any };
    return c.bodyTemplate.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_m, path) => {
      const value = resolvePath(context, path.split('.'));
      if (value === undefined || value === null) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  private request(urlStr: string, method: string, body: string, headers: Record<string, string>, transcript?: string[]): Promise<HttpTranscriptResponse> {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const lib = u.protocol === 'https:' ? https : http;
      const redactedHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      for (const [k, v] of Object.entries(headers || {})) {
        redactedHeaders[k] = /authorization|api[-_]?key|token|secret/i.test(k) ? '***' : v;
      }
      transcript?.push(`→ ${method} ${u.protocol}//${u.hostname}${u.pathname}${u.search || ''}`);
      transcript?.push(`→ headers ${JSON.stringify(redactedHeaders)}`);
      transcript?.push(`→ body ${body.length > 500 ? body.slice(0, 500) + '…' : body}`);
      const req = lib.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
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
      req.on('timeout', () => { req.destroy(); transcript?.push('× timeout after 10s'); reject(new Error('Webhook timeout')); });
      req.write(body);
      req.end();
    });
  }
}

function resolvePath(obj: any, keys: string[]): any {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function safeHost(url?: string): string {
  if (!url) return '';
  try { return new URL(url).host; } catch { return ''; }
}
