import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.userModel
      .findOne({ $or: [{ username }, { email: username }], isActive: true })
      .select('+password');

    if (!user) return null;
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return null;

    const { password: _, ...result } = user.toObject();
    return result;
  }

  async login(user: any, res: any) {
    const userId = user._id?.toString() || user.id?.toString();
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(userId);

    // Set HttpOnly cookie
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const maxAge = this.parseDuration(refreshExpires);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge,
    });

    await this.userModel.findByIdAndUpdate(userId, { lastLoginAt: new Date() });

    return {
      accessToken,
      user: {
        id: userId,
        username: user.username,
        email: user.email,
        role: user.role,
        forceChangePassword: user.forceChangePassword,
      },
    };
  }

  async refreshAccessToken(refreshTokenValue: string) {
    if (!refreshTokenValue) throw new UnauthorizedException('Refresh token not found');

    const tokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
    const tokenDoc = await this.refreshTokenModel
      .findOne({ tokenHash, revoked: false })
      .populate('userId');

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userModel.findById(tokenDoc.userId);
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    const accessToken = this.generateAccessToken(user);
    return { accessToken };
  }

  async logout(refreshTokenValue: string, res: any) {
    if (refreshTokenValue) {
      const tokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
      await this.refreshTokenModel.updateOne({ tokenHash }, { revoked: true });
    }
    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string, res: any) {
    await this.refreshTokenModel.updateMany({ userId, revoked: false }, { revoked: true });
    res.clearCookie('refresh_token');
    return { message: 'All sessions terminated' };
  }

  private generateAccessToken(user: any): string {
    const userId = user._id?.toString() || user.id?.toString();
    return this.jwtService.sign(
      { sub: userId, username: user.username, email: user.email, role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresAt = new Date(Date.now() + this.parseDuration(expiresIn));

    await this.refreshTokenModel.create({ userId, tokenHash, expiresAt });
    return token;
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const [, value, unit] = match;
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return parseInt(value) * multipliers[unit];
  }

  // Called by LocalStrategy — checks authMethod and delegates
  async validateUserWithMethod(username: string, password: string, settingsService: any): Promise<any> {
    const settings = await settingsService.getSettings();
    const method = settings?.authenticationMethod || 'local';

    if (method === 'ldap') {
      return this.validateUserLdap(username, password, settings, settingsService);
    }
    // local
    return this.validateUser(username, password);
  }

  async validateUserLdap(username: string, password: string, settings: any, settingsService: any): Promise<any> {
    const { LdapService } = await import('./ldap.service');
    const ldapSvc = new LdapService();
    try {
      const ldapUser = await ldapSvc.authenticate(settings, username, password);
      if (!ldapUser) return null;
      // Find or create local user record
      let user = await this.userModel.findOne({ username: ldapUser.username });
      if (!user) {
        const bcrypt = await import('bcrypt');
        const randomPass = await bcrypt.hash(Math.random().toString(36), 10);
        user = await this.userModel.create({
          username: ldapUser.username,
          email: ldapUser.email || `${ldapUser.username}@ldap.local`,
          password: randomPass,
          role: 'readonly',
          authSource: 'ldap',
        });
      }
      return user.toObject();
    } catch (e) {
      this.logger.error('LDAP validate error:', (e as any).message);
      return null;
    }
  }

  async getOAuthRedirectUrl(settingsService: any): Promise<string> {
    const settings = await settingsService.getSettings();
    const { OAuthService } = await import('./oauth.service');
    return new OAuthService().getAuthorizationUrl(settings);
  }

  async handleOAuthCallback(code: string, settingsService: any, res: any): Promise<any> {
    const settings = await settingsService.getSettings();
    const { OAuthService } = await import('./oauth.service');
    const oauthUser = await new OAuthService().exchangeCode(settings, code);
    // Find or create user
    let user = await this.userModel.findOne({ email: oauthUser.email });
    if (!user) {
      const bcrypt = await import('bcrypt');
      const randomPass = await bcrypt.hash(Math.random().toString(36), 10);
      user = await this.userModel.create({
        username: oauthUser.username,
        email: oauthUser.email,
        password: randomPass,
        role: 'readonly',
        authSource: 'oauth',
        displayName: oauthUser.name,
      });
    }
    return this.login(user.toObject(), res);
  }
}
