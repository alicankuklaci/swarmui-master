import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class MfaService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async generateSecret(userId: string): Promise<{ secret: string; qrCodeUrl: string; otpAuthUrl: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    const secret = speakeasy.generateSecret({
      name: `SwarmUI (${user.email})`,
      length: 32,
    });

    // Store temp secret (not yet confirmed)
    await this.userModel.findByIdAndUpdate(userId, { mfaTempSecret: secret.base32 });

    const otpAuthUrl = secret.otpauth_url!;
    const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

    return { secret: secret.base32, qrCodeUrl, otpAuthUrl };
  }

  async enableMfa(userId: string, token: string): Promise<{ message: string; backupCodes: string[] }> {
    const user = await this.userModel.findById(userId).select('+mfaTempSecret');
    if (!user || !user.mfaTempSecret) throw new BadRequestException('No pending MFA setup');

    const isValid = speakeasy.totp.verify({
      secret: user.mfaTempSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!isValid) throw new BadRequestException('Invalid TOTP token');

    const backupCodes = this.generateBackupCodes();
    await this.userModel.findByIdAndUpdate(userId, {
      mfaSecret: user.mfaTempSecret,
      mfaTempSecret: undefined,
      mfaEnabled: true,
      mfaBackupCodes: backupCodes,
    });

    return { message: '2FA enabled successfully', backupCodes };
  }

  async disableMfa(userId: string, token: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId).select('+mfaSecret');
    if (!user) throw new BadRequestException('User not found');
    if (!user.mfaEnabled) throw new BadRequestException('MFA is not enabled');

    const isValid = this.verifyToken(user.mfaSecret!, token) || this.verifyBackupCode(user, token);
    if (!isValid) throw new UnauthorizedException('Invalid token');

    await this.userModel.findByIdAndUpdate(userId, {
      mfaEnabled: false,
      mfaSecret: undefined,
      mfaTempSecret: undefined,
      mfaBackupCodes: [],
    });

    return { message: '2FA disabled successfully' };
  }

  async verifyMfaToken(userId: string, token: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('+mfaSecret +mfaBackupCodes');
    if (!user || !user.mfaEnabled || !user.mfaSecret) return false;

    if (this.verifyToken(user.mfaSecret, token)) return true;
    if (await this.verifyAndConsumeBackupCode(user, token)) return true;

    return false;
  }

  private verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 2 });
  }

  private verifyBackupCode(user: any, code: string): boolean {
    return (user.mfaBackupCodes || []).includes(code.toUpperCase());
  }

  private async verifyAndConsumeBackupCode(user: UserDocument, code: string): Promise<boolean> {
    const codes: string[] = (user as any).mfaBackupCodes || [];
    const idx = codes.indexOf(code.toUpperCase());
    if (idx === -1) return false;

    // Consume the backup code
    codes.splice(idx, 1);
    await this.userModel.findByIdAndUpdate(user._id, { mfaBackupCodes: codes });
    return true;
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }
}
