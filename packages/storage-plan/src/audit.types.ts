import type { NodeExecCommandId } from './command.types';

// One audit entry per node-exec call. Persisted both in Mongo
// (`storage_audit_logs`) and mirrored to a per-manager file so the record
// survives even if the Mongo this module exists to protect is unreachable.
export interface StorageAuditEntry {
  ts: string; // ISO-8601
  userId: string; // null-equivalent "system" when the reconciler fires
  installSessionId: string;
  nodeId: string;
  commandId: NodeExecCommandId;
  // Serialized args — bounded length; the audit writer truncates oversize
  // payloads to 1 KiB and sets `argsTruncated`.
  args: Record<string, string | number | boolean>;
  argsTruncated?: boolean;
  exitCode: number;
  stdoutHash: string;
  stderrHash: string;
  durationMs: number;
}
