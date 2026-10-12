// Agent `/node-exec` whitelist. Agent decodes the command id and runs a fixed argv.
// Keep this list in sync with the agent's command dispatcher — adding a new id here
// without a matching agent handler is a validation error at install time.
export const NODE_EXEC_COMMANDS = [
  // Common
  'mkdir-swarmui-shared-root',
  'test-mount-write',

  // SeaweedFS
  'apt-install-fuse3',
  'docker-pull-seaweedfs',
  'docker-run-seaweedfs-master',
  'docker-run-seaweedfs-volume',
  'docker-run-seaweedfs-filer',
  'install-seaweedfs-mount-systemd-unit',
  'systemctl-enable-seaweedfs-mount',
  'firewall-allow-seaweedfs-ports',
  'seaweedfs-cluster-healthcheck',
  'seaweedfs-tls-bootstrap',

  // NFS
  'apt-install-nfs-common',
  'apt-install-nfs-kernel-server',
  'systemctl-enable-nfs-server',
  'nfs-export-add',
  'nfs-export-remove',
  'mount-nfs',
  'fstab-add',
  'fstab-remove',
] as const;

export type NodeExecCommandId = (typeof NODE_EXEC_COMMANDS)[number];

export interface NodeExecRequest {
  commandId: NodeExecCommandId;
  // Typed, validated args per commandId. Each driver's installer defines its own
  // arg schema; the agent re-validates with the same schema loaded from this
  // package, so a mismatch is a plan-vs-executor contract break.
  args: Record<string, string | number | boolean>;
  nodeId: string;
  installSessionId: string;
  // Short-lived (5-minute) HMAC binding (nonce, commandId, argvHash, nodeId,
  // installSessionId, exp). Agent verifies before dispatch.
  signature: {
    nonce: string;
    exp: number; // unix seconds
    hmac: string; // hex
  };
}

export interface NodeExecResult {
  commandId: NodeExecCommandId;
  nodeId: string;
  exitCode: number;
  stdoutHash: string; // sha256 hex, truncated to 32 chars
  stderrHash: string;
  // Short stdout/stderr tails for diagnostics (full output never persisted).
  stdoutTail?: string;
  stderrTail?: string;
  durationMs: number;
}
