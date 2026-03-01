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
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
