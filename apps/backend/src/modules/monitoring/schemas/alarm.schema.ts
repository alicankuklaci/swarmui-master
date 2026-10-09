import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlarmDocument = Alarm & Document;

@Schema({ _id: false })
export class AlarmSnapshotEntry {
  @Prop() name: string;
  @Prop() cpuPct: number;
  @Prop() memUsedPct: number;
}

@Schema({ _id: false })
export class AlarmNodeState {
  @Prop() cpuPct: number;
  @Prop() memUsedPct: number;
  @Prop() diskUsedPct: number;
}

@Schema({ _id: false })
export class AlarmNotifiedChannel {
  @Prop({ type: Types.ObjectId, ref: 'NotificationChannel' }) channelId: Types.ObjectId;
  @Prop() channelType: string;
  @Prop() success: boolean;
  @Prop() error?: string;
  @Prop() at: Date;
}

@Schema({ _id: false })
export class AlarmSnapshot {
  @Prop({ type: [AlarmSnapshotEntry], default: [] }) topContainersCpu: AlarmSnapshotEntry[];
  @Prop({ type: [AlarmSnapshotEntry], default: [] }) topContainersMem: AlarmSnapshotEntry[];
  @Prop({ type: AlarmNodeState }) nodeState?: AlarmNodeState;
}

@Schema({ _id: false })
export class AlarmTargetSnapshot {
  @Prop() nodeId?: string;
  @Prop() containerId?: string;
  @Prop() stackName?: string;
  @Prop({ type: Types.ObjectId, ref: 'UptimeCheck' }) uptimeCheckId?: Types.ObjectId;
}

@Schema({ timestamps: false, collection: 'alarms' })
export class Alarm {
  @Prop({ type: Types.ObjectId, ref: 'AlarmRule', required: true, index: true })
  ruleId: Types.ObjectId;
  @Prop({ required: true }) ruleName: string;
  @Prop({ required: true, enum: ['info', 'warning', 'critical'], type: String })
  severity: 'info' | 'warning' | 'critical';
  @Prop({ required: true, enum: ['firing', 'resolved'], type: String, default: 'firing', index: true })
  status: 'firing' | 'resolved';
  @Prop({ required: true, index: true }) firedAt: Date;
  @Prop() resolvedAt?: Date;
  @Prop({ required: true, default: 0 }) value: number;
  @Prop({ required: true, default: 0 }) threshold: number;
  @Prop({ type: AlarmTargetSnapshot, default: () => ({}) }) target: AlarmTargetSnapshot;
  @Prop({ type: AlarmSnapshot, default: () => ({}) }) snapshot: AlarmSnapshot;
  @Prop({ type: [AlarmNotifiedChannel], default: [] }) notifiedChannels: AlarmNotifiedChannel[];
  @Prop({ type: Types.ObjectId, ref: 'User' }) acknowledgedBy?: Types.ObjectId;
  @Prop() acknowledgedAt?: Date;
}

export const AlarmSchema = SchemaFactory.createForClass(Alarm);
AlarmSchema.index({ status: 1, firedAt: -1 });
AlarmSchema.index({ severity: 1, firedAt: -1 });
// TTL on firedAt — 7 days.
AlarmSchema.index({ firedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
