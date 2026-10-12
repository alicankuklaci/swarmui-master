import { STORAGE_STATES, type StorageState } from '@swarmui-master/storage-plan';
import {
  InvalidTransitionError,
  StorageStateMachine,
  UnknownStateError,
  canTransition,
  isStorageState,
  nextStatesFrom,
} from './state-machine';

describe('StorageStateMachine', () => {
  it('starts in PENDING by default', () => {
    expect(new StorageStateMachine().current()).toBe('PENDING');
  });

  describe('happy paths', () => {
    it('fresh install: PENDING → INSTALLING → HEALTHY', () => {
      const sm = new StorageStateMachine();
      expect(sm.transition('INSTALLING')).toBe('INSTALLING');
      expect(sm.transition('HEALTHY')).toBe('HEALTHY');
    });

    it('adopting existing: PENDING → ADOPTING → HEALTHY', () => {
      const sm = new StorageStateMachine();
      sm.transition('ADOPTING');
      expect(sm.transition('HEALTHY')).toBe('HEALTHY');
    });

    it('degradation + recovery cycle: HEALTHY → DEGRADED → RECOVERING → HEALTHY', () => {
      const sm = new StorageStateMachine('HEALTHY');
      sm.transition('DEGRADED');
      sm.transition('RECOVERING');
      expect(sm.transition('HEALTHY')).toBe('HEALTHY');
    });

    it('uninstall: HEALTHY → DRAINING → UNINSTALLED → PENDING (next install)', () => {
      const sm = new StorageStateMachine('HEALTHY');
      sm.transition('DRAINING');
      sm.transition('UNINSTALLED');
      expect(sm.transition('PENDING')).toBe('PENDING');
    });

    it('uninstall failure + retry: HEALTHY → DRAINING → UNINSTALL_FAILED → DRAINING → UNINSTALLED', () => {
      const sm = new StorageStateMachine('HEALTHY');
      sm.transition('DRAINING');
      sm.transition('UNINSTALL_FAILED');
      sm.transition('DRAINING');
      expect(sm.transition('UNINSTALLED')).toBe('UNINSTALLED');
    });
  });

  describe('illegal transitions are rejected', () => {
    it('cannot skip INSTALLING to HEALTHY directly from PENDING', () => {
      const sm = new StorageStateMachine();
      expect(() => sm.transition('HEALTHY')).toThrow(InvalidTransitionError);
    });

    it('cannot go HEALTHY → UNINSTALLED without draining', () => {
      const sm = new StorageStateMachine('HEALTHY');
      expect(() => sm.transition('UNINSTALLED')).toThrow(InvalidTransitionError);
    });

    it('cannot resurrect from UNINSTALLED to HEALTHY', () => {
      const sm = new StorageStateMachine('UNINSTALLED');
      expect(() => sm.transition('HEALTHY')).toThrow(InvalidTransitionError);
    });

    it('UNINSTALL_FAILED has only one legal exit (DRAINING retry)', () => {
      expect(nextStatesFrom('UNINSTALL_FAILED')).toEqual(['DRAINING']);
      const sm = new StorageStateMachine('UNINSTALL_FAILED');
      expect(() => sm.transition('HEALTHY')).toThrow(InvalidTransitionError);
      expect(() => sm.transition('UNINSTALLED')).toThrow(InvalidTransitionError);
    });

    it('RECOVERING can fall back to DEGRADED, forward to HEALTHY, or fail', () => {
      expect(new Set(nextStatesFrom('RECOVERING'))).toEqual(
        new Set<StorageState>(['HEALTHY', 'DEGRADED', 'UNINSTALL_FAILED']),
      );
    });
  });

  describe('persistence helpers', () => {
    it('rehydrates from a known state string', () => {
      const sm = StorageStateMachine.fromPersisted('DEGRADED');
      expect(sm.current()).toBe('DEGRADED');
    });

    it('refuses unknown states (guards against DB drift)', () => {
      expect(() => StorageStateMachine.fromPersisted('BOGUS')).toThrow(UnknownStateError);
    });

    it('isStorageState narrows strings correctly', () => {
      expect(isStorageState('HEALTHY')).toBe(true);
      expect(isStorageState('healthy')).toBe(false);
      expect(isStorageState('bogus')).toBe(false);
    });
  });

  describe('transition map is total', () => {
    it('every state in STORAGE_STATES has an entry in the transition map', () => {
      for (const s of STORAGE_STATES) {
        // nextStatesFrom returns a readonly array even for terminal states;
        // undefined would mean the state is missing from the map.
        expect(nextStatesFrom(s)).toBeDefined();
      }
    });

    it('canTransition reflects nextStatesFrom', () => {
      for (const s of STORAGE_STATES) {
        for (const t of nextStatesFrom(s)) {
          expect(canTransition(s, t)).toBe(true);
        }
      }
    });
  });
});
