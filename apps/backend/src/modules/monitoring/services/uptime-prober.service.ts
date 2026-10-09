import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { execFile } from 'child_process';
import { URL } from 'url';
import { UptimeCheck, UptimeCheckDocument } from '../schemas/uptime-check.schema';
import { UptimeHistory, UptimeHistoryDocument } from '../schemas/uptime-history.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface ProbeResult {
  status: 'up' | 'down';
  responseMs: number;
  httpStatus?: number;
  error?: string;
}

@Injectable()
export class UptimeProberService {
  private readonly logger = new Logger(UptimeProberService.name);
  // Tracks last run per check to respect per-check intervalSec within the
  // cron tick granularity (10s).
  private readonly lastRun = new Map<string, number>();

  constructor(
    @InjectModel(UptimeCheck.name) private readonly checkModel: Model<UptimeCheckDocument>,
    @InjectModel(UptimeHistory.name) private readonly historyModel: Model<UptimeHistoryDocument>,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'uptime-prober' })
  async run() {
    const checks = await this.checkModel.find({ enabled: true }).lean();
    const now = Date.now();
    const due = checks.filter((c) => {
      const last = this.lastRun.get(String(c._id)) || 0;
      return now - last >= (c.intervalSec || 30) * 1000 - 500;
    });
    if (!due.length) return;
    await Promise.all(due.map((c) => this.probeAndStore(c)));
  }

  async probeAndStore(check: any): Promise<ProbeResult> {
    this.lastRun.set(String(check._id), Date.now());
    const result = await this.probe(check);
    await this.historyModel.create({
      checkId: new Types.ObjectId(check._id),
      ts: new Date(),
      status: result.status,
      responseMs: result.responseMs,
      httpStatus: result.httpStatus,
      error: result.error,
    });
    const prev = check.lastStatus;
    await this.checkModel.updateOne({ _id: check._id }, {
      $set: {
        lastStatus: result.status,
        lastResponseMs: result.responseMs,
        lastHttpStatus: result.httpStatus,
        lastCheckedAt: new Date(),
        lastError: result.error,
      },
    });
    if (prev && prev !== result.status) {
      this.events.emit('uptime.changed', { checkId: String(check._id), from: prev, to: result.status, result });
    }
    return result;
  }

  async probe(check: any): Promise<ProbeResult> {
    const timeoutMs = (check.timeoutSec || 10) * 1000;
    switch (check.type) {
      case 'http': return this.probeHttp(check, timeoutMs);
      case 'tcp': return this.probeTcp(check, timeoutMs);
      case 'ping': return this.probePing(check, timeoutMs);
      default: return { status: 'down', responseMs: 0, error: `unknown probe type: ${check.type}` };
    }
  }

  private probeHttp(check: any, timeoutMs: number): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const started = Date.now();
      let u: URL;
      try { u = new URL(check.target); } catch (err: any) {
        return resolve({ status: 'down', responseMs: 0, error: 'invalid URL' });
      }
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: check.method || 'GET',
        headers: check.headers || {},
        timeout: timeoutMs,
        rejectUnauthorized: false, // self-signed OK for probes
      }, (res) => {
        let body = '';
        const expectBody = check.expectedBody;
        res.on('data', (chunk) => {
          if (expectBody) { if (body.length < 65_536) body += chunk; }
        });
        res.on('end', () => {
          const responseMs = Date.now() - started;
          const httpStatus = res.statusCode || 0;
          const okStatus = check.expectedStatus
            ? httpStatus === check.expectedStatus
            : httpStatus >= 200 && httpStatus < 400;
          const okBody = !expectBody || body.includes(expectBody);
          if (okStatus && okBody) resolve({ status: 'up', responseMs, httpStatus });
          else resolve({
            status: 'down',
            responseMs,
            httpStatus,
            error: !okStatus
              ? `expected status ${check.expectedStatus || '2xx/3xx'}, got ${httpStatus}`
              : `response body missing "${expectBody}"`,
          });
        });
      });
      req.on('error', (err) => resolve({
        status: 'down', responseMs: Date.now() - started, error: err.message,
      }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'down', responseMs: Date.now() - started, error: 'timeout' });
      });
      req.end();
    });
  }

  private probeTcp(check: any, timeoutMs: number): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const started = Date.now();
      const [host, portStr] = String(check.target).split(':');
      const port = Number(portStr);
      if (!host || !port) {
        return resolve({ status: 'down', responseMs: 0, error: 'invalid target (expected host:port)' });
      }
      const socket = net.connect({ host, port, timeout: timeoutMs });
      socket.once('connect', () => {
        socket.destroy();
        resolve({ status: 'up', responseMs: Date.now() - started });
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve({ status: 'down', responseMs: Date.now() - started, error: 'timeout' });
      });
      socket.once('error', (err) => {
        resolve({ status: 'down', responseMs: Date.now() - started, error: err.message });
      });
    });
  }

  private probePing(check: any, timeoutMs: number): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const started = Date.now();
      // -c1 one packet; -W timeout seconds (linux ping)
      execFile('ping', ['-c', '1', '-W', String(Math.ceil(timeoutMs / 1000)), check.target], {
        timeout: timeoutMs + 1000,
      }, (err, stdout) => {
        const responseMs = Date.now() - started;
        if (err) resolve({ status: 'down', responseMs, error: err.message });
        else resolve({ status: 'up', responseMs });
      });
    });
  }

  async successRate24h(checkId: Types.ObjectId | string): Promise<{ total: number; up: number; pct: number }> {
    const from = new Date(Date.now() - 24 * 3600 * 1000);
    const rows = await this.historyModel.aggregate([
      { $match: { checkId: new Types.ObjectId(String(checkId)), ts: { $gte: from } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    let up = 0, total = 0;
    for (const r of rows) { total += r.count; if (r._id === 'up') up = r.count; }
    return { total, up, pct: total > 0 ? (up / total) * 100 : 0 };
  }

  async history(checkId: string, from: Date, to: Date, limit = 1000) {
    return this.historyModel.find({
      checkId: new Types.ObjectId(checkId),
      ts: { $gte: from, $lte: to },
    }).sort({ ts: 1 }).limit(limit).lean();
  }
}
