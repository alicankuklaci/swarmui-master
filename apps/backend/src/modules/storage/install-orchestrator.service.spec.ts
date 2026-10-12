import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import {
  STORAGE_INSTALL_EVENT,
  type InstallPlan,
  type NodeExecResult,
  type SharedStorageConfig,
  type StorageInstallStepEvent,
} from '@swarmui-master/storage-plan';
import { StorageAuditService } from './audit.service';
import { DriverRegistry } from './drivers/driver.registry';
import { InstallOrchestratorService } from './install-orchestrator.service';
import { NodeExecClient } from './node-exec.client';
import { SharedStorage } from './schemas/shared-storage.schema';

// Install orchestrator tests. Each test asserts both the *state* trail
// (what was persisted / transitioned) and the *event* trail (what SSE
// clients would see). The orchestrator is the single serialized point where
// those two trails are produced, so divergence here is the thing to catch.

const CFG: SharedStorageConfig = {
  backend: 'seaweedfs',
  nodes: ['node02', 'node03'],
  mountPoint: '/var/lib/swarmui/shared',
};

function okResult(nodeId: string, cmd: string, dur = 10): NodeExecResult {
  return {
    commandId: cmd as NodeExecResult['commandId'],
    nodeId,
    exitCode: 0,
    stdoutHash: 'a'.repeat(32),
    stderrHash: 'b'.repeat(32),
    durationMs: dur,
  };
}

function failResult(
  nodeId: string,
  cmd: string,
  tail = 'boom\nmore',
): NodeExecResult {
  return {
    commandId: cmd as NodeExecResult['commandId'],
    nodeId,
    exitCode: 1,
    stdoutHash: '',
    stderrHash: '',
    stderrTail: tail,
    durationMs: 5,
  };
}

function tinyPlan(sessionId: string): InstallPlan {
  return {
    backend: 'seaweedfs',
    sessionId,
    mountPoint: '/var/lib/swarmui/shared',
    steps: [
      {
        id: 's01-mkdir-root-node02',
        description: 'mkdir',
        nodeId: 'node02',
        commandId: 'mkdir-swarmui-shared-root',
        args: { path: '/var/lib/swarmui/shared' },
      },
      {
        id: 's02-pull-image-node02',
        description: 'pull',
        nodeId: 'node02',
        commandId: 'docker-pull-seaweedfs',
        args: { image: 'chrislusf/seaweedfs:3.80' },
      },
      {
        id: 's03-run-master-node02',
        description: 'master',
        nodeId: 'node02',
        commandId: 'docker-run-seaweedfs-master',
        args: { port: 9333 },
      },
    ],
  };
}

// Lightweight filter matcher — supports top-level equality + {$in: [...]}.
// _id is implicit (singleton), so the filter's _id key is skipped.
function filterMatches(
  doc: Record<string, unknown> | null,
  filter: Record<string, unknown>,
): boolean {
  if (!doc) return false;
  for (const [k, v] of Object.entries(filter)) {
    if (k === '_id') continue;
    if (v !== null && typeof v === 'object' && '$in' in (v as object)) {
      const allowed = (v as { $in: unknown[] }).$in;
      if (!allowed.includes(doc[k])) return false;
    } else if (v !== doc[k]) {
      return false;
    }
  }
  return true;
}

describe('InstallOrchestratorService', () => {
  let service: InstallOrchestratorService;
  let emitter: EventEmitter2;
  let frames: StorageInstallStepEvent[];
  let findById: jest.Mock;
  let findOne: jest.Mock;
  let findOneAndUpdate: jest.Mock;
  let createDoc: jest.Mock;
  let updateOne: jest.Mock;
  let planFn: jest.Mock;
  let sendFn: jest.Mock;
  let auditWrite: jest.Mock;

  const buildModel = (initial: Record<string, unknown> | null) => {
    const docState: { current: Record<string, unknown> | null } = {
      current: initial,
    };
    findById = jest.fn(() => ({
      lean: () => ({ exec: () => Promise.resolve(docState.current) }),
    }));
    findOne = jest.fn((filter: Record<string, unknown>) => ({
      lean: () => ({
        exec: () =>
          Promise.resolve(
            filterMatches(docState.current, filter) ? docState.current : null,
          ),
      }),
    }));
    findOneAndUpdate = jest.fn(
      (
        filter: Record<string, unknown>,
        update: { $set?: Record<string, unknown> },
        options?: { new?: boolean },
      ) => {
        const run = () => {
          if (!filterMatches(docState.current, filter)) {
            return Promise.resolve(null);
          }
          const prev = { ...(docState.current as Record<string, unknown>) };
          docState.current = { ...prev, ...(update.$set ?? {}) };
          return Promise.resolve(options?.new ? docState.current : prev);
        };
        return { lean: () => ({ exec: run }), exec: run };
      },
    );
    // A pack #2: Case C path. The real _id unique index raises E11000 on
    // a second create — this stub mirrors that so Case C → Case D
    // fall-through is exercised in tests.
    createDoc = jest.fn((doc) => {
      if (docState.current) {
        const err: Error & { code?: number } = new Error('E11000 duplicate key');
        err.code = 11000;
        throw err;
      }
      docState.current = { ...doc };
      return Promise.resolve(doc);
    });
    updateOne = jest.fn(
      (
        filter: Record<string, unknown>,
        update: { $set?: Record<string, unknown> },
      ) => ({
        exec: () => {
          if (!filterMatches(docState.current, filter)) {
            return Promise.resolve({
              acknowledged: true,
              matchedCount: 0,
              modifiedCount: 0,
            });
          }
          docState.current = {
            ...(docState.current as Record<string, unknown>),
            ...(update.$set ?? {}),
          };
          return Promise.resolve({
            acknowledged: true,
            matchedCount: 1,
            modifiedCount: 1,
          });
        },
      }),
    );
    return {
      storeRef: docState,
      model: { findById, findOne, findOneAndUpdate, create: createDoc, updateOne },
    };
  };

  const build = async (
    initial: Record<string, unknown> | null,
    plan: InstallPlan | Error,
    responses: NodeExecResult[] | Error[],
    uninstallPlan?: InstallPlan | Error,
  ) => {
    const { storeRef, model } = buildModel(initial);
    planFn = jest.fn(() => {
      if (plan instanceof Error) throw plan;
      return plan;
    });
    const uninstallPlanFn = jest.fn(() => {
      if (uninstallPlan instanceof Error) throw uninstallPlan;
      return uninstallPlan;
    });
    let callIdx = 0;
    sendFn = jest.fn(() => {
      const r = responses[callIdx++];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    });
    auditWrite = jest.fn().mockResolvedValue(undefined);
    const mod = await Test.createTestingModule({
      providers: [
        InstallOrchestratorService,
        {
          provide: getModelToken(SharedStorage.name),
          useValue: model,
        },
        {
          provide: DriverRegistry,
          useValue: {
            get: () => ({
              backend: 'seaweedfs',
              plan: planFn,
              uninstallPlan: uninstallPlanFn,
              enumerateConsumers: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: NodeExecClient,
          useValue: {
            buildRequest: (input: {
              commandId: string;
              args: Record<string, unknown>;
              nodeId: string;
              installSessionId: string;
            }) => ({
              commandId: input.commandId,
              args: input.args,
              nodeId: input.nodeId,
              installSessionId: input.installSessionId,
              signature: { nonce: 'n', exp: 1, hmac: 'h' },
            }),
            send: sendFn,
          },
        },
        {
          provide: StorageAuditService,
          useValue: { write: auditWrite },
        },
        EventEmitter2,
      ],
    }).compile();
    service = mod.get(InstallOrchestratorService);
    emitter = mod.get(EventEmitter2);
    frames = [];
    emitter.on(STORAGE_INSTALL_EVENT, (f: StorageInstallStepEvent) => frames.push(f));
    return { storeRef };
  };

  describe('happy path', () => {
    it('runs every step, writes audit, transitions INSTALLING → HEALTHY', async () => {
      const plan = tinyPlan('sess-1');
      const { storeRef } = await build(null, plan, [
        okResult('node02', 'mkdir-swarmui-shared-root', 11),
        okResult('node02', 'docker-pull-seaweedfs', 22),
        okResult('node02', 'docker-run-seaweedfs-master', 33),
      ]);
      await service.run('sess-1', CFG, 'u1');
      // State
      expect((storeRef.current as { state: string }).state).toBe('HEALTHY');
      expect((storeRef.current as { lastAttemptedStepId: string }).lastAttemptedStepId).toBe(
        's03-run-master-node02',
      );
      // Audit per step
      expect(auditWrite).toHaveBeenCalledTimes(3);
      // Event trail
      expect(frames.map((f) => f.phase)).toEqual(['started', 'step', 'step', 'step', 'done']);
      expect(frames.map((f) => f.state)).toEqual([
        'INSTALLING',
        'INSTALLING',
        'INSTALLING',
        'INSTALLING',
        'HEALTHY',
      ]);
      expect(frames[1].stepId).toBe('s01-mkdir-root-node02');
      expect(frames[3].durationMs).toBe(33);
      // Monotonic frames
      expect(frames.map((f) => f.frame)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('step failure', () => {
    it('stops at the first non-zero exit, flips to UNINSTALL_FAILED, emits failed', async () => {
      const plan = tinyPlan('sess-2');
      const { storeRef } = await build(null, plan, [
        okResult('node02', 'mkdir-swarmui-shared-root'),
        failResult('node02', 'docker-pull-seaweedfs', 'exit 1\nfull log'),
      ]);
      await service.run('sess-2', CFG, 'u1');
      expect((storeRef.current as { state: string }).state).toBe('UNINSTALL_FAILED');
      // Steps 1 and 2 ran; step 3 did not.
      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(frames.map((f) => f.phase)).toEqual(['started', 'step', 'step', 'failed']);
      const failed = frames[frames.length - 1];
      expect(failed.state).toBe('UNINSTALL_FAILED');
      expect(failed.stepId).toBe('s02-pull-image-node02');
      expect(failed.cause).toBe('exit 1');
    });
  });

  describe('transport failure (Sprint 3 not implemented, DNS, timeout)', () => {
    it('converts a thrown transport error into exitCode=255 and fails the install', async () => {
      const plan = tinyPlan('sess-3');
      await build(null, plan, [new Error('node-exec not implemented')]);
      await service.run('sess-3', CFG, 'u1');
      const failed = frames[frames.length - 1];
      expect(failed.phase).toBe('failed');
      // The step event just before carries exitCode=255 (synthetic).
      const step = frames[frames.length - 2];
      expect(step.exitCode).toBe(255);
      expect(step.cause).toBe('node-exec not implemented');
    });
  });

  describe('resume', () => {
    it('skips steps already recorded in lastAttemptedStepId within the same session', async () => {
      const plan = tinyPlan('sess-4');
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02', 'node03'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'INSTALLING',
          installSessionId: 'sess-4',
          lastAttemptedStepId: 's01-mkdir-root-node02',
        },
        plan,
        [
          okResult('node02', 'docker-pull-seaweedfs'),
          okResult('node02', 'docker-run-seaweedfs-master'),
        ],
      );
      await service.run('sess-4', CFG, 'u1');
      expect(sendFn).toHaveBeenCalledTimes(2);
      expect((storeRef.current as { state: string }).state).toBe('HEALTHY');
      // No step frame for the skipped step.
      const stepIds = frames.filter((f) => f.phase === 'step').map((f) => f.stepId);
      expect(stepIds).toEqual([
        's02-pull-image-node02',
        's03-run-master-node02',
      ]);
    });

    it('D pack #4: resume marker drift (lastAttemptedStepId not in current plan) fails fast instead of restarting from step 0', async () => {
      // Previously `plan.steps.findIndex(id==lastAttempted) + 1` returned
      // -1 + 1 = 0 when the marker was stale, silently re-running every
      // non-idempotent step. The fix detects findIndex=-1 and terminates
      // with UNINSTALL_FAILED + a `failed` frame naming the drift.
      const plan = tinyPlan('sess-drift');
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02', 'node03'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'INSTALLING',
          installSessionId: 'sess-drift',
          lastAttemptedStepId: 's99-step-renamed-away', // not in tinyPlan
        },
        plan,
        [], // no step responses — if any step runs, send() returns undefined and the test fails loudly
      );
      await service.run('sess-drift', CFG, 'u1');
      // No step was executed.
      expect(sendFn).not.toHaveBeenCalled();
      // State flipped to UNINSTALL_FAILED (not stuck in INSTALLING).
      expect((storeRef.current as { state: string }).state).toBe(
        'UNINSTALL_FAILED',
      );
      // A failed frame explains the drift.
      const failed = frames[frames.length - 1];
      expect(failed.phase).toBe('failed');
      expect(failed.state).toBe('UNINSTALL_FAILED');
      expect(failed.cause).toContain('resume marker drift');
    });

    it('restarts from step 0 when installSessionId differs', async () => {
      const plan = tinyPlan('sess-5-new');
      await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02', 'node03'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'UNINSTALLED',
          installSessionId: 'sess-older',
          lastAttemptedStepId: 's02-pull-image-node02',
        },
        plan,
        [
          okResult('node02', 'mkdir-swarmui-shared-root'),
          okResult('node02', 'docker-pull-seaweedfs'),
          okResult('node02', 'docker-run-seaweedfs-master'),
        ],
      );
      await service.run('sess-5-new', CFG, 'u1');
      expect(sendFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('concurrent install (A pack #2)', () => {
    it('a second run() with the same initial state=PENDING cannot re-acquire INSTALLING', async () => {
      // Two concurrent queueInstall POSTs: both drivers.plan() succeed,
      // both call orchestrator.run with different session ids. The
      // compound-filter findOneAndUpdate acquire must let exactly one
      // win; the loser falls through to Case D (findById) and run() bails
      // without executing any step.
      const plan1 = tinyPlan('sess-win');
      const plan2 = tinyPlan('sess-lose');
      await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02', 'node03'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'PENDING',
          installSessionId: 'sess-prev',
        },
        plan1,
        [
          okResult('node02', 'mkdir-swarmui-shared-root'),
          okResult('node02', 'docker-pull-seaweedfs'),
          okResult('node02', 'docker-run-seaweedfs-master'),
        ],
      );
      // First run wins, acquires INSTALLING, runs plan to HEALTHY.
      await service.run('sess-win', CFG, 'u1');
      expect(frames.filter((f) => f.phase === 'done')).toHaveLength(1);
      const sendCountAfterFirst = sendFn.mock.calls.length;

      // Second run tries to acquire but state is now HEALTHY (post first
      // run). findOne match fails (session mismatch), findOneAndUpdate
      // filter fails (HEALTHY not in {PENDING,UNINSTALLED}), create throws
      // E11000, findById returns HEALTHY — run() sees current!=INSTALLING
      // and bails without executing any step.
      planFn.mockImplementation(() => plan2);
      frames.length = 0;
      await service.run('sess-lose', CFG, 'u2');
      // No steps executed on the second run.
      expect(sendFn.mock.calls.length).toBe(sendCountAfterFirst);
      // No `started` or `done` from the second run.
      expect(frames.filter((f) => f.phase === 'started')).toHaveLength(0);
      expect(frames.filter((f) => f.phase === 'done')).toHaveLength(0);
    });
  });

  describe('refuses to run over an existing non-reinstallable state', () => {
    it('leaves state untouched when doc is HEALTHY and session mismatches', async () => {
      const plan = tinyPlan('sess-6-new');
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02', 'node03'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'HEALTHY',
          installSessionId: 'sess-older',
        },
        plan,
        [],
      );
      await service.run('sess-6-new', CFG, 'u1');
      expect(sendFn).not.toHaveBeenCalled();
      expect((storeRef.current as { state: string }).state).toBe('HEALTHY');
      // Only `started` was emitted? No — openStateMachine returns before
      // emitting started when state isn't INSTALLING.
      expect(frames.filter((f) => f.phase === 'started')).toHaveLength(0);
    });
  });

  describe('plan generation failure', () => {
    it('emits failed with state=PENDING and does not touch the DB', async () => {
      await build(null, new Error('bad config'), []);
      await service.run('sess-7', CFG, 'u1');
      expect(createDoc).not.toHaveBeenCalled();
      expect(updateOne).not.toHaveBeenCalled();
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({
        phase: 'failed',
        state: 'PENDING',
        cause: 'bad config',
      });
    });
  });

  // -------- uninstall (Sprint 4 D2) --------

  // Tiny uninstall plan: two steps so we can prove ordering + terminal state.
  // Each step is `terminalOnFail` in the real driver; we don't assert on that
  // flag here (orchestrator treats all failures the same way for v1).
  function tinyUninstallPlan(sessionId: string): InstallPlan {
    return {
      backend: 'seaweedfs',
      sessionId,
      mountPoint: '/var/lib/swarmui/shared',
      steps: [
        {
          id: 'u01-stop-mount-node02',
          description: 'systemctl disable --now seaweedfs-mount on node02',
          nodeId: 'node02',
          commandId: 'systemctl-enable-seaweedfs-mount',
          args: { action: 'disable' },
          terminalOnFail: true,
        },
        {
          id: 'u02-stop-master-node02',
          description: 'Stop seaweedfs master container on node02',
          nodeId: 'node02',
          commandId: 'docker-run-seaweedfs-master',
          args: { action: 'stop' },
          terminalOnFail: true,
        },
      ],
    };
  }

  describe('uninstall happy path', () => {
    it('walks every step, transitions DRAINING → UNINSTALLED, emits done', async () => {
      // A pack #11: StorageService.queueUninstall is now the atomic
      // HEALTHY/DEGRADED → DRAINING acquirer. By the time the orchestrator's
      // uninstall() runs the doc is already in DRAINING; the orchestrator
      // only drives DRAINING → UNINSTALLED (or UNINSTALL_FAILED on error).
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'DRAINING',
          installSessionId: 'sess-un-1',
        },
        tinyPlan('ignored'), // install plan — not touched by uninstall
        [
          okResult('node02', 'systemctl-enable-seaweedfs-mount'),
          okResult('node02', 'docker-run-seaweedfs-master'),
        ],
        tinyUninstallPlan('sess-un-1'),
      );
      await service.uninstall('sess-un-1', CFG, 'u1');
      expect((storeRef.current as { state: string }).state).toBe('UNINSTALLED');
      // Audit per step.
      expect(auditWrite).toHaveBeenCalledTimes(2);
      // Event trail: started(DRAINING) → step → step → done(UNINSTALLED).
      expect(frames.map((f) => f.phase)).toEqual(['started', 'step', 'step', 'done']);
      expect(frames.map((f) => f.state)).toEqual([
        'DRAINING',
        'DRAINING',
        'DRAINING',
        'UNINSTALLED',
      ]);
      expect(frames[1].stepId).toBe('u01-stop-mount-node02');
    });
  });

  describe('uninstall step failure', () => {
    it('stops at the first non-zero exit, flips to UNINSTALL_FAILED', async () => {
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'DRAINING',
          installSessionId: 'sess-un-2',
        },
        tinyPlan('ignored'),
        [failResult('node02', 'systemctl-enable-seaweedfs-mount', 'unit not found')],
        tinyUninstallPlan('sess-un-2'),
      );
      await service.uninstall('sess-un-2', CFG, 'u1');
      expect((storeRef.current as { state: string }).state).toBe('UNINSTALL_FAILED');
      expect(sendFn).toHaveBeenCalledTimes(1);
      const failed = frames[frames.length - 1];
      expect(failed.phase).toBe('failed');
      expect(failed.state).toBe('UNINSTALL_FAILED');
      expect(failed.cause).toBe('unit not found');
    });
  });

  describe('uninstall refuses from a non-tearing-down state', () => {
    it('bails without transitioning when state is UNINSTALLED', async () => {
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'UNINSTALLED',
          installSessionId: 'sess-older',
        },
        tinyPlan('ignored'),
        [],
        tinyUninstallPlan('sess-un-3'),
      );
      await service.uninstall('sess-un-3', CFG, 'u1');
      expect((storeRef.current as { state: string }).state).toBe('UNINSTALLED');
      expect(sendFn).not.toHaveBeenCalled();
      // One `failed` frame explaining the refusal, no `started`.
      expect(frames.map((f) => f.phase)).toEqual(['failed']);
      expect(frames[0].state).toBe('UNINSTALLED');
      expect(frames[0].cause).toContain('refused');
    });
  });

  describe('uninstall plan generation failure', () => {
    it('emits failed without touching the state machine', async () => {
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'HEALTHY',
          installSessionId: 'sess-prev',
        },
        tinyPlan('ignored'),
        [],
        new Error('bad uninstall config'),
      );
      await service.uninstall('sess-un-4', CFG, 'u1');
      expect((storeRef.current as { state: string }).state).toBe('HEALTHY');
      expect(sendFn).not.toHaveBeenCalled();
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({
        phase: 'failed',
        state: 'HEALTHY',
        cause: 'bad uninstall config',
      });
    });
  });
});
