import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingsDocument = Settings & Document;

@Schema({ timestamps: true, collection: 'settings' })
export class Settings {
  @Prop({ default: 'swarmui' })
  instanceId: string;

  @Prop({ default: true })
  allowLocalAdminPassword: boolean;

  @Prop({ type: String, enum: ['local', 'ldap', 'oauth'], default: 'local' })
  authenticationMethod: string;

  @Prop()
  logoUrl?: string;

  @Prop()
  loginBannerMessage?: string;

  @Prop({ default: 3600 })
  sessionLifetime: number;

  @Prop({ default: 60 })
  snapshotInterval: number;

  @Prop({ default: true })
  enableTelemetry: boolean;

  // SMTP configuration
  @Prop({ type: Object })
  smtp?: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    from?: string;
    secure?: boolean;
  };

  // Log retention (days)
  @Prop({ default: 30 })
  authLogRetentionDays: number;

  @Prop({ default: 90 })
  activityLogRetentionDays: number;

  // Notification webhooks
  @Prop({ type: [Object], default: [] })
  webhooks?: Array<{
    name: string;
    url: string;
    type: 'slack' | 'teams' | 'custom';
    enabled: boolean;
    events: string[];
  }>;

  // Email notification recipients
  @Prop({ type: [String], default: [] })
  notificationEmails?: string[];
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
