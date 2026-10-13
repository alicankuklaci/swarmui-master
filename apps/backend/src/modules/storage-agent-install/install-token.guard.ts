import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InstallTokenStore } from './install-token.store';

// Gatekeeper for /install.sh + /bundle.tgz. The two endpoints are not
// JWT-authenticated (an operator pastes `curl ... | sudo bash` on a bare
// node and has no bearer handy), but they are not public either — a short
// opaque token in `?t=` is required. The token itself is issued only by
// an admin via POST /install-token, so an unauthenticated reader on the
// internet gets a 401 straight away.
@Injectable()
export class InstallTokenGuard implements CanActivate {
  constructor(private readonly tokens: InstallTokenStore) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.query?.t;
    const token = Array.isArray(raw) ? String(raw[0]) : (raw as string | undefined);
    if (!this.tokens.consume(token)) {
      throw new UnauthorizedException(
        'install endpoint requires valid ?t= token from POST /storage/agent/install-token',
      );
    }
    return true;
  }
}
