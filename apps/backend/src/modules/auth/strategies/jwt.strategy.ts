import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';

// Allow token from header or query param (for SSE connections)
function jwtFromRequestOrQuery(req: any) {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  if (req?.query?.token) return req.query.token;
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: jwtFromRequestOrQuery,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'default-secret'),
    });
  }

  async validate(payload: any) {
    const user = await this.userModel.findById(payload.sub).select('-password -__v').lean();
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return {
      id: (user._id as any).toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      forceChangePassword: user.forceChangePassword,
    };
  }
}
