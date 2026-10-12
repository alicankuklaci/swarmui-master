import {
  STORAGE_STATES,
  type StorageState,
} from '@swarmui-master/storage-plan';

// Transition map encodes the whole lifecycle. If a target isn't listed under a
// source, the transition is rejected — the state machine is strict so a bug in
// an installer can't quietly move the module through an undefined state.
//
// Modeled after docs/shared-storage-module-plan.md § State machine. ADOPTING is
// its own entry path (PENDING → ADOPTING → HEALTHY) for the "take over an
// existing cluster" case; silent auto-reconcile was explicitly rejected during
// architect review because of the split-brain risk.
const TRANSITIONS: Readonly<Record<StorageState, readonly StorageState[]>> = {
  PENDING: ['INSTALLING', 'ADOPTING'],
  INSTALLING: ['HEALTHY', 'UNINSTALL_FAILED'],
  ADOPTING: ['HEALTHY', 'UNINSTALL_FAILED'],
  HEALTHY: ['DEGRADED', 'DRAINING'],
  DEGRADED: ['RECOVERING', 'DRAINING'],
  RECOVERING: ['HEALTHY', 'DEGRADED', 'UNINSTALL_FAILED'],
  DRAINING: ['UNINSTALLED', 'UNINSTALL_FAILED'],
  UNINSTALL_FAILED: ['DRAINING'], // operator-initiated retry
  UNINSTALLED: ['PENDING'], // fresh install starts over
};

export class InvalidTransitionError extends Error {
  constructor(public readonly from: StorageState, public readonly to: StorageState) {
    super(`Invalid storage state transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class UnknownStateError extends Error {
  constructor(public readonly state: string) {
    super(`Unknown storage state: ${state}`);
    this.name = 'UnknownStateError';
  }
}

export function isStorageState(value: string): value is StorageState {
  return (STORAGE_STATES as readonly string[]).includes(value);
}

export function canTransition(from: StorageState, to: StorageState): boolean {
  const allowed = TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

export function nextStatesFrom(state: StorageState): readonly StorageState[] {
  return TRANSITIONS[state];
}

// Pure state machine. Owns no persistence — callers persist the new state
// themselves after transition() returns, so a mid-write crash leaves the DB
// consistent with the last successfully-persisted state.
export class StorageStateMachine {
  constructor(private state: StorageState = 'PENDING') {}

  current(): StorageState {
    return this.state;
  }

  // Returns the new state. Throws InvalidTransitionError on illegal transitions.
  transition(to: StorageState): StorageState {
    if (!canTransition(this.state, to)) {
      throw new InvalidTransitionError(this.state, to);
    }
    this.state = to;
    return this.state;
  }

  // Hydrate from a persisted value. Throws UnknownStateError if the string
  // isn't a known state — guards against DB corruption or schema drift.
  static fromPersisted(value: string): StorageStateMachine {
    if (!isStorageState(value)) throw new UnknownStateError(value);
    return new StorageStateMachine(value);
  }
}
