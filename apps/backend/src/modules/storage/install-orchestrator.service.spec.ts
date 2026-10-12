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

describe('InstallOrchestratorService', () => {
  let service: InstallOrchestratorService;
  let emitter: EventEmitter2;
  let frames: StorageInstallStepEvent[];
  let findById: jest.Mock;
  let createDoc: jest.Mock;
  let updateOne: jest.Mock;
  let planFn: jest.Mock;
  let sendFn: jest.Mock;
  let auditWrite: jest.Mock;

  const buildModel = (initial: Record<string, unknown> | null) => {
    const docState = { current: initial };
    findById = jest.fn(() => ({
      lean: () => ({ exec: () => Promise.resolve(docState.current) }),
    }));
    createDoc = jest.fn((doc) => {
      docState.current = { ...doc };
      return Promise.resolve(doc);
    });
    updateOne = jest.fn((_filter, update) => ({
      exec: () => {
        const set = update.$set ?? {};
        docState.current = { ...(docState.current ?? {}), ...set };
        return Promise.resolve({ acknowledged: true });
      },
    }));
    return {
      storeRef: docState,
      model: { findById, create: createDoc, updateOne },
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
    it('walks every step, transitions HEALTHY → DRAINING → UNINSTALLED, emits done', async () => {
      const { storeRef } = await build(
        {
          _id: 'primary',
          backend: 'seaweedfs',
          driver: 'seaweedfs',
          nodes: ['node02'],
          mountPoint: '/var/lib/swarmui/shared',
          state: 'HEALTHY',
          installSessionId: 'sess-prev-install',
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
          state: 'HEALTHY',
          installSessionId: 'sess-prev',
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
