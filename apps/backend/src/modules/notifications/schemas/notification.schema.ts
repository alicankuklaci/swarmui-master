import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;
export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ default: false })
  global: boolean;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: String, enum: ['info', 'warning', 'error', 'success'], default: 'info' })
  level: NotificationLevel;

  @Prop()
  resourceType?: string;

  @Prop()
  resourceId?: string;

  @Prop({ default: false })
  read: boolean;

  @Prop()
  readAt?: Date;

  @Prop()
  link?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ global: 1, read: 1 });
NotificationSchema.index({ createdAt: -1 });
// TTL: auto-delete after 30 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
