import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('ActivityLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url, ip } = request;
    const user = (request as any).user;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        const response = ctx.getResponse();
        const statusCode = response.statusCode;

        if (user && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          this.logger.log(
            `[${user.username}] ${method} ${url} ${statusCode} ${duration}ms ip=${ip}`,
          );
        }
      }),
    );
  }
}
