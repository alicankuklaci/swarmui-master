import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { NODE_EXEC_COMMANDS, type NodeExecCommandId } from '@swarmui-master/storage-plan';

export type StorageAuditLogDocument = StorageAuditLog & Document;

// One row per /node-exec call. Mirrored to a per-manager file by
// StorageAuditService so the record survives even when the Mongo this module
// exists to protect is unreachable.
@Schema({ timestamps: true, collection: 'storage_audit_logs' })
export class StorageAuditLog {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  installSessionId: string;

  @Prop({ required: true })
  nodeId: string;

  @Prop({ type: String, required: true, enum: NODE_EXEC_COMMANDS })
  commandId: NodeExecCommandId;

  @Prop({ type: Object, required: true })
  args: Record<string, string | number | boolean>;

  @Prop({ default: false })
  argsTruncated: boolean;

  @Prop({ required: true })
  exitCode: number;

  @Prop({ required: true })
  stdoutHash: string;

  @Prop({ required: true })
  stderrHash: string;

  @Prop({ required: true })
  durationMs: number;
}

export const StorageAuditLogSchema = SchemaFactory.createForClass(StorageAuditLog);
StorageAuditLogSchema.index({ installSessionId: 1, createdAt: 1 });
StorageAuditLogSchema.index({ nodeId: 1, createdAt: -1 });
StorageAuditLogSchema.index({ createdAt: -1 });
