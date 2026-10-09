import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UptimeHistoryDocument = UptimeHistory & Document;

@Schema({ timestamps: false, collection: 'uptime_history' })
export class UptimeHistory {
  @Prop({ type: Types.ObjectId, ref: 'UptimeCheck', required: true, index: true })
  checkId: Types.ObjectId;
  @Prop({ required: true, index: true }) ts: Date;
  @Prop({ required: true, enum: ['up', 'down'], type: String }) status: 'up' | 'down';
  @Prop({ required: true }) responseMs: number;
  @Prop() httpStatus?: number;
  @Prop() error?: string;
}

export const UptimeHistorySchema = SchemaFactory.createForClass(UptimeHistory);
UptimeHistorySchema.index({ checkId: 1, ts: -1 });
UptimeHistorySchema.index({ ts: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
