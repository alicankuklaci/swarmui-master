import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuthLogDocument = AuthLog & Document;
export type AuthLogEvent = 'login_success' | 'login_fail' | 'logout' | 'token_refresh' | 'mfa_success' | 'mfa_fail' | 'password_change';

@Schema({ timestamps: true, collection: 'auth_logs' })
export class AuthLog {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop()
  username?: string;

  @Prop({ type: String, enum: ['login_success', 'login_fail', 'logout', 'token_refresh', 'mfa_success', 'mfa_fail', 'password_change'] })
  event: AuthLogEvent;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  details?: string;

  @Prop({ default: true })
  success: boolean;
}

export const AuthLogSchema = SchemaFactory.createForClass(AuthLog);
AuthLogSchema.index({ userId: 1 });
AuthLogSchema.index({ event: 1 });
AuthLogSchema.index({ createdAt: -1 });
// TTL: auto-delete after 30 days
AuthLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
