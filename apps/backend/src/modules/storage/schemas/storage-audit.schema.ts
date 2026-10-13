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

  // Not every audit entry has these — a step that failed before exec() ran
  // (agent unreachable, HMAC reject, timeout before handler dispatch) has no
  // stdout/stderr to hash. Defaulting to '' lets the audit record land so the
  // orchestrator's fail-closed path doesn't swallow the real exit reason.
  @Prop({ required: false, default: '' })
  stdoutHash: string;

  @Prop({ required: false, default: '' })
  stderrHash: string;

  @Prop({ required: true })
  durationMs: number;
}

export const StorageAuditLogSchema = SchemaFactory.createForClass(StorageAuditLog);
StorageAuditLogSchema.index({ installSessionId: 1, createdAt: 1 });
StorageAuditLogSchema.index({ nodeId: 1, createdAt: -1 });
StorageAuditLogSchema.index({ createdAt: -1 });
