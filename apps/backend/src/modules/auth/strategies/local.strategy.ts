import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { SettingsService } from '../../settings/settings.service';
import { AuthLogsService } from '../../auth-logs/auth-logs.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly authLogsService: AuthLogsService,
    private readonly settingsService: SettingsService,
  ) {
    super({ usernameField: 'username', passReqToCallback: true });
  }

  async validate(req: any, username: string, password: string) {
    const user = await this.authService.validateUserWithMethod(username, password, this.settingsService);
    if (!user) {
      // Log failed login
      this.authLogsService
        .log({
          event: 'login_fail',
          username,
          ip: req.ip,
          userAgent: req.headers?.['user-agent'],
          success: false,
          details: 'Invalid credentials',
        })
        .catch(() => {});
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}
