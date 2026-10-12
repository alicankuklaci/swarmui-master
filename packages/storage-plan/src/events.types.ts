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
