import type { NodeExecCommandId } from './command.types';
import type { StorageBackend } from './state.types';

// An InstallPlan is the deterministic output of a driver's planner, consumed by
// the state machine. Each step maps 1:1 to a node-exec call; the state machine
// records which step last ran so a restart resumes from the next step.
export interface InstallPlanStep {
  id: string; // stable, e.g. "s3-install-fuse3-node02"
  description: string; // human-facing, surfaced in the install SSE stream
  nodeId: string;
  commandId: NodeExecCommandId;
  args: Record<string, string | number | boolean>;
  // If true, failing this step moves the whole plan to UNINSTALL_FAILED instead
  // of rolling back. Reserved for destructive final steps (fstab remove, etc.).
  terminalOnFail?: boolean;
}

export interface InstallPlan {
  backend: StorageBackend;
  // Opaque session id; also used as HMAC input (see command.types).
  sessionId: string;
  steps: InstallPlanStep[];
  // Mount point exposed to stacks; the "simple mode" NFS driver and the
  // SeaweedFS driver both land users at this path.
  mountPoint: string; // always /var/lib/swarmui/shared in v1
  // Driver-specific options the planner needs after construction (replication
  // factor, filer port, etc.). Opaque to storage-core.
  driverOpts?: Record<string, unknown>;
}

export interface SharedStorageConfig {
  backend: StorageBackend;
  nodes: string[]; // swarm node hostnames
  mountPoint: string;
  // For NFS: which node runs the export (SPOF). Not used for SeaweedFS.
  nfsServerNode?: string;
  // For SeaweedFS: replication string, default '010'.
  replication?: string;
  // Opt-in: skip TLS at install (dev / trusted network). Default false.
  insecure?: boolean;
}
