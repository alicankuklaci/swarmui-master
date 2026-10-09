import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationChannelDocument = NotificationChannel & Document;
export type ChannelType = 'telegram' | 'slack' | 'email' | 'webhook';

@Schema({ _id: false })
export class ChannelTestResult {
  @Prop({ required: true }) ts: Date;
  @Prop({ required: true }) success: boolean;
  @Prop() error?: string;
}

@Schema({ timestamps: true, collection: 'notification_channels' })
export class NotificationChannel {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, enum: ['telegram', 'slack', 'email', 'webhook'], type: String })
  type: ChannelType;
  // JSON string containing the plaintext config (then AES-GCM encrypted at rest).
  @Prop({ required: true }) configEncrypted: string;
  @Prop({ default: true }) enabled: boolean;
  @Prop({ type: ChannelTestResult }) lastTestResult?: ChannelTestResult;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
}

export const NotificationChannelSchema = SchemaFactory.createForClass(NotificationChannel);
