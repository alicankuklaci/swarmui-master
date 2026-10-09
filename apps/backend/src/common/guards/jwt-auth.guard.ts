import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ModuleRef } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Try API key auth first — allows the same routes to accept either a JWT
    // (interactive user session) or an API key (programmatic access).
    const req = context.switchToHttp().getRequest();
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      try {
        const apiKeys = this.moduleRef.get(ApiKeysService, { strict: false });
        const keyDoc = await apiKeys.validate(apiKeyHeader);
        if (keyDoc) {
          req.user = {
            id: keyDoc.userId.toString(),
            userId: keyDoc.userId.toString(),
            role: 'operator', // API keys default to operator-level access
            scope: keyDoc.scope,
            apiKeyId: (keyDoc as any)._id?.toString(),
          };
          return true;
        }
      } catch {
        // fall through to JWT below
      }
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
