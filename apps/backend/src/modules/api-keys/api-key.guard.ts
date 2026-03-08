import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-Api-Key header');
    }

    const keyDoc = await this.apiKeysService.validate(apiKey);
    if (!keyDoc) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    request.user = { id: keyDoc.userId.toString() };
    request.apiKeyScope = keyDoc.scope;

    return true;
  }
}
