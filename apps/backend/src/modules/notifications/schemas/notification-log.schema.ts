import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationLogDocument = NotificationLog & Document;

@Schema({ timestamps: false, collection: 'notification_logs' })
export class NotificationLog {
  @Prop({ type: Types.ObjectId, ref: 'NotificationChannel', required: true, index: true })
  channelId: Types.ObjectId;
  @Prop({ required: true }) channelName: string;
  @Prop({ required: true }) channelType: string;
  @Prop({ type: Types.ObjectId, ref: 'Alarm' }) alarmId?: Types.ObjectId;
  @Prop({ required: true, index: true }) ts: Date;
  @Prop({ required: true }) success: boolean;
  @Prop() error?: string;
  @Prop({ default: 0 }) latencyMs: number;
}

export const NotificationLogSchema = SchemaFactory.createForClass(NotificationLog);
// TTL: 30 days.
NotificationLogSchema.index({ ts: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
