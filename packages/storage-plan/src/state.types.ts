// Shared storage lifecycle states. See docs/shared-storage-module-plan.md § State machine.
// Nine states; HEALTHY is the terminal state of a successful install and the start
// state of any post-install transition.
export const STORAGE_STATES = [
  'PENDING',
  'INSTALLING',
  'HEALTHY',
  'DEGRADED',
  'RECOVERING',
  'DRAINING',
  'ADOPTING',
  'UNINSTALL_FAILED',
  'UNINSTALLED',
] as const;

export type StorageState = (typeof STORAGE_STATES)[number];

// Backends the module can orchestrate. Keep in sync with the drivers directory.
export const STORAGE_BACKENDS = ['seaweedfs', 'nfs'] as const;
export type StorageBackend = (typeof STORAGE_BACKENDS)[number];
