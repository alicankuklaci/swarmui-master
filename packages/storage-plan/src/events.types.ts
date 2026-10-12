import type { StorageState } from './state.types';

// Events emitted by the install orchestrator onto the module's EventEmitter2
// bus. The SSE controller filters by sessionId and forwards each event as a
// framed message to the client. Shape is stable — Sprint 3's agent spec and
// the frontend viewer both key off these field names.

export const STORAGE_INSTALL_EVENT = 'storage.install.step' as const;
export type StorageInstallEventName = typeof STORAGE_INSTALL_EVENT;

// One frame per plan step attempt (success or failure) plus two terminal
// frames: {phase:'started', state:'INSTALLING'} at the top and
// {phase:'done'|'failed', state:'HEALTHY'|'UNINSTALL_FAILED'} at the bottom.
export interface StorageInstallStepEvent {
  sessionId: string;
  // 'started' | 'step' | 'done' | 'failed'. 'step' carries stepId + exitCode;
  // the terminals carry only state.
  phase: 'started' | 'step' | 'done' | 'failed';
  state: StorageState;
  stepId?: string;
  stepDescription?: string;
  nodeId?: string;
  exitCode?: number;
  durationMs?: number;
  // When phase='failed', a short cause (first stderr line / exception message)
  // so the UI doesn't need to fetch the audit entry to show something useful.
  cause?: string;
  // Server-assigned monotonic frame number. The SSE controller uses this as
  // the EventSource `id:` so a reconnecting client can resume with
  // Last-Event-ID.
  frame: number;
  // Server ts (ISO-8601) — redundant with the SSE wrapper's timestamp but
  // included so the frame is self-describing when persisted outside SSE.
  ts: string;
}

// Emitted by the reconciler when the set of swarm services bind-mounting the
// shared path changes between ticks. Not part of the install SSE stream —
// the alerting / dashboarding path consumes this separately. Added + removed
// are set differences; `consumers` is the full current set so a late
// subscriber doesn't need to replay the stream to catch up.
export const STORAGE_CONSUMER_DRIFT_EVENT = 'storage.consumer.drift' as const;
export type StorageConsumerDriftEventName = typeof STORAGE_CONSUMER_DRIFT_EVENT;

export interface StorageConsumerDriftEvent {
  mountPoint: string;
  consumers: string[];
  added: string[];
  removed: string[];
  ts: string;
}

// Emitted by the reconciler when a probeHealth verdict drives a HEALTHY ↔
// DEGRADED ↔ RECOVERING state transition. Not part of the install SSE
// stream — alerting / dashboarding path consumes this separately. `cause`
// is non-empty when the transition landed in a non-HEALTHY state and
// carries the short probe diagnostic.
export const STORAGE_STATE_TRANSITION_EVENT =
  'storage.state.transition' as const;
export type StorageStateTransitionEventName =
  typeof STORAGE_STATE_TRANSITION_EVENT;

export interface StorageStateTransitionEvent {
  from: StorageState;
  to: StorageState;
  cause?: string;
  ts: string;
}
