import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MetricContainerDocument = MetricContainer & Document;

@Schema({ timestamps: false, collection: 'metric_containers' })
export class MetricContainer {
  @Prop({ required: true, index: true }) nodeId: string;
  @Prop({ required: true, index: true }) containerId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) image: string;
  @Prop() stackName?: string;
  @Prop() serviceId?: string;
  @Prop({ required: true, index: true }) ts: Date;
  @Prop({ required: true, default: 0 }) cpuPct: number;
  @Prop({ required: true, default: 0 }) memUsedBytes: number;
  @Prop({ required: true, default: 0 }) memLimitBytes: number;
  @Prop({ required: true, default: 0 }) memUsedPct: number;
  @Prop({ default: 0 }) netRxBps: number;
  @Prop({ default: 0 }) netTxBps: number;
  @Prop({ default: 0 }) blkioReadBps: number;
  @Prop({ default: 0 }) blkioWriteBps: number;
}

export const MetricContainerSchema = SchemaFactory.createForClass(MetricContainer);
MetricContainerSchema.index({ nodeId: 1, ts: -1 });
MetricContainerSchema.index({ containerId: 1, ts: -1 });
// TTL: 7 days.
MetricContainerSchema.index({ ts: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
