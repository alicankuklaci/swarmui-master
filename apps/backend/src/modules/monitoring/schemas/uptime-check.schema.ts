import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UptimeCheckDocument = UptimeCheck & Document;
export type UptimeCheckType = 'http' | 'tcp' | 'ping';
export type UptimeCheckStatus = 'up' | 'down' | 'unknown';

@Schema({ timestamps: true, collection: 'uptime_checks' })
export class UptimeCheck {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, enum: ['http', 'tcp', 'ping'], type: String }) type: UptimeCheckType;
  @Prop({ required: true }) target: string;
  @Prop({ default: 30 }) intervalSec: number;
  @Prop({ default: 10 }) timeoutSec: number;
  @Prop() expectedStatus?: number;
  @Prop() expectedBody?: string;
  @Prop({ enum: ['GET', 'POST', 'HEAD'], default: 'GET', type: String }) method?: string;
  @Prop({ type: Object, default: {} }) headers?: Record<string, string>;
  @Prop({ default: true }) enabled: boolean;
  @Prop({ type: Types.ObjectId, ref: 'AlarmRule' }) alarmRuleId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;

  // last probe snapshot — kept here (not in history) so list queries don't need a lookup.
  @Prop({ enum: ['up', 'down', 'unknown'], default: 'unknown', type: String })
  lastStatus?: UptimeCheckStatus;
  @Prop() lastResponseMs?: number;
  @Prop() lastHttpStatus?: number;
  @Prop() lastCheckedAt?: Date;
  @Prop() lastError?: string;
}

export const UptimeCheckSchema = SchemaFactory.createForClass(UptimeCheck);
UptimeCheckSchema.index({ enabled: 1 });
