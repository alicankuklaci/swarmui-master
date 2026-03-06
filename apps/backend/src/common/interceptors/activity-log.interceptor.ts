import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { ActivityLogsService } from '../../modules/activity-logs/activity-logs.service';
import { SyslogService } from '../services/syslog.service';

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    private readonly activityLogsService: ActivityLogsService,
    private readonly syslogService: SyslogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url, ip } = request;
    const user = (request as any).user;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        if (user && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          const response = ctx.getResponse();
          const statusCode = response.statusCode;
          const duration = Date.now() - start;
          const resource = url.split('/').filter(Boolean)[2] || url;

          // Forward to syslog if configured
          this.getSyslogSettings().then(cfg => {
            if (cfg?.enabled && cfg.host) {
              const logMsg = JSON.stringify({ user: user.username, method, url, status: response.statusCode });
              this.syslogService.send(cfg.host, cfg.port || 514, (cfg.protocol as 'udp'|'tcp') || 'udp', logMsg).catch(() => {});
            }
          }).catch(() => {});
          this.activityLogsService
            .create({
              userId: user.id,
              username: user.username,
              action: `${method} ${url}`,
              resource,
              method,
              path: url,
              statusCode,
              ip,
              userAgent: request.headers['user-agent'],
              details: `duration=${duration}ms`,
            })
            .catch(() => {});
        }
      }),
    );
  }

  private syslogCache: { enabled: boolean; host: string; port: number; protocol: string } | null = null;
  private syslogCacheTime = 0;

  private async getSyslogSettings(): Promise<{ enabled: boolean; host: string; port: number; protocol: string } | null> {
    const now = Date.now();
    if (this.syslogCache !== undefined && now - this.syslogCacheTime < 60000) return this.syslogCache;
    const host = process.env.SYSLOG_HOST;
    if (!host) { this.syslogCache = null; this.syslogCacheTime = now; return null; }
    this.syslogCache = {
      enabled: true, host,
      port: parseInt(process.env.SYSLOG_PORT || '514'),
      protocol: (process.env.SYSLOG_PROTOCOL || 'udp') as 'udp'|'tcp',
    };
    this.syslogCacheTime = now;
    return this.syslogCache;
  }

}