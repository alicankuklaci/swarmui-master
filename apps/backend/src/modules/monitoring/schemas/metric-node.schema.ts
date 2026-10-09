import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MetricNodeDocument = MetricNode & Document;

@Schema({ _id: false })
export class MetricNodeCpu {
  @Prop({ required: true }) usagePct: number;
  @Prop({ required: true }) cores: number;
  @Prop({ type: [Number], default: [] }) loadavg: number[];
}
@Schema({ _id: false })
export class MetricNodeMem {
  @Prop({ required: true }) usedBytes: number;
  @Prop({ required: true }) totalBytes: number;
  @Prop({ required: true }) usedPct: number;
}
@Schema({ _id: false })
export class MetricNodeDiskEntry {
  @Prop({ required: true }) mount: string;
  @Prop({ required: true }) usedBytes: number;
  @Prop({ required: true }) totalBytes: number;
  @Prop({ required: true }) usedPct: number;
}
@Schema({ _id: false })
export class MetricNodeNet {
  @Prop({ default: 0 }) rxBps: number;
  @Prop({ default: 0 }) txBps: number;
}
@Schema({ _id: false })
export class MetricNodeContainers {
  @Prop({ default: 0 }) running: number;
  @Prop({ default: 0 }) stopped: number;
  @Prop({ default: 0 }) total: number;
}

@Schema({ timestamps: false, collection: 'metric_nodes' })
export class MetricNode {
  @Prop({ required: true, index: true }) nodeId: string;
  @Prop({ required: true, index: true }) ts: Date;
  @Prop({ type: MetricNodeCpu, required: true }) cpu: MetricNodeCpu;
  @Prop({ type: MetricNodeMem, required: true }) mem: MetricNodeMem;
  @Prop({ type: [MetricNodeDiskEntry], default: [] }) disk: MetricNodeDiskEntry[];
  @Prop({ type: MetricNodeNet, default: () => ({}) }) net: MetricNodeNet;
  @Prop({ type: MetricNodeContainers, default: () => ({}) }) containers: MetricNodeContainers;
}

export const MetricNodeSchema = SchemaFactory.createForClass(MetricNode);
MetricNodeSchema.index({ nodeId: 1, ts: -1 });
// TTL: auto-delete after 7 days.
MetricNodeSchema.index({ ts: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
