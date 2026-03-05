import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { ActivityLogsService } from '../../modules/activity-logs/activity-logs.service';

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

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
}
