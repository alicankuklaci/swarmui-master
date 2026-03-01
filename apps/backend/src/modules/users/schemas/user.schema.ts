import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export type UserRole = 'admin' | 'operator' | 'helpdesk' | 'standard' | 'readonly';
export type AuthProvider = 'local' | 'oauth' | 'ldap';

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: String, enum: ['admin', 'operator', 'helpdesk', 'standard', 'readonly'], default: 'standard' })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  forceChangePassword: boolean;

  @Prop({ type: String, enum: ['local', 'oauth', 'ldap'], default: 'local' })
  authProvider: AuthProvider;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  avatarUrl?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
