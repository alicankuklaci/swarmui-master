import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlarmRuleDocument = AlarmRule & Document;
export type AlarmTarget = 'node' | 'container' | 'uptime' | 'stack';
export type AlarmMetric = 'cpu' | 'mem' | 'disk' | 'uptime' | 'containerCount';
export type AlarmOperator = '>' | '<' | '==' | '>=' | '<=';
export type AlarmSeverity = 'info' | 'warning' | 'critical';

@Schema({ _id: false })
export class AlarmTargetFilter {
  @Prop() nodeId?: string;
  @Prop() containerName?: string;  // regex
  @Prop() stackName?: string;
  @Prop({ type: Types.ObjectId, ref: 'UptimeCheck' }) uptimeCheckId?: Types.ObjectId;
}

@Schema({ timestamps: true, collection: 'alarm_rules' })
export class AlarmRule {
  @Prop({ required: true, trim: true }) name: string;
  @Prop() description?: string;
  @Prop({ required: true, enum: ['node', 'container', 'uptime', 'stack'], type: String })
  target: AlarmTarget;
  @Prop({ type: AlarmTargetFilter, default: () => ({}) }) targetFilter?: AlarmTargetFilter;
  @Prop({ required: true, enum: ['cpu', 'mem', 'disk', 'uptime', 'containerCount'], type: String })
  metric: AlarmMetric;
  @Prop({ required: true, enum: ['>', '<', '==', '>=', '<='], type: String })
  operator: AlarmOperator;
  @Prop({ required: true }) threshold: number;
  @Prop({ default: 300 }) windowSec: number;
  @Prop({ default: 600 }) cooldownSec: number;
  @Prop({ required: true, enum: ['info', 'warning', 'critical'], type: String, default: 'warning' })
  severity: AlarmSeverity;
  @Prop({ type: [Types.ObjectId], ref: 'NotificationChannel', default: [] })
  channelIds: Types.ObjectId[];
  @Prop({ default: true }) enabled: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;

  // Internal state for the engine (not written by API).
  @Prop() lastFiredAt?: Date;
  @Prop() lastEvaluatedAt?: Date;
  @Prop({ default: 'ok', enum: ['ok', 'pending', 'firing'], type: String })
  state?: 'ok' | 'pending' | 'firing';
  @Prop() pendingSince?: Date;
  @Prop({ type: Types.ObjectId, ref: 'Alarm' }) currentAlarmId?: Types.ObjectId;
}

export const AlarmRuleSchema = SchemaFactory.createForClass(AlarmRule);
AlarmRuleSchema.index({ enabled: 1 });
