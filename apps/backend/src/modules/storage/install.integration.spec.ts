import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import {
  STORAGE_INSTALL_EVENT,
  type SharedStorageConfig,
  type StorageInstallStepEvent,
} from '@swarmui-master/storage-plan';
import { startAgent, type AgentHandle } from '@swarmui-master/swarm-agent';
import { StorageAuditService } from './audit.service';
import { ConsumerInspectorService } from './consumer-inspector.service';
import { DriverRegistry } from './drivers/driver.registry';
import { NfsDriver } from './drivers/nfs/nfs.driver';
import { SeaweedfsDriver } from './drivers/seaweedfs/seaweedfs.driver';
import { InstallOrchestratorService } from './install-orchestrator.service';
import { NodeExecClient } from './node-exec.client';
import { SharedStorage } from './schemas/shared-storage.schema';
import { StorageAuditLog } from './schemas/storage-audit.schema';

// Install path never calls enumerateConsumers — the empty-returning stub
// keeps the DI graph satisfied without needing a dockerode fixture.
const inspectorStub = { enumerateConsumers: jest.fn().mockResolvedValue([]) };

// End-to-end install over a live swarm-agent process. The orchestrator, the
// SeaweedFS driver, the HMAC client, and the agent dispatcher all run as
// their production code — only the Mongo models and the audit file sink are
// stubbed. If an invariant between any of those four cracks, this test is
// where it shows up.

const HMAC_SECRET = 'B'.repeat(48); // > 32-byte minimum

describe('Install integration — orchestrator ↔ swarm-agent', () => {
  let agent: AgentHandle;
  let agentAudit: jest.Mock;
  let orchestrator: InstallOrchestratorService;
  let docStore: { current: Record<string, unknown> | null };
  let frames: StorageInstallStepEvent[];
  let mongoAudit: jest.Mock;

  beforeEach(async () => {
    agentAudit = jest.fn();
    agent = await startAgent({
      hmacSecret: HMAC_SECRET,
      host: '127.0.0.1',
      port: 0,
      onAudit: agentAudit,
    });

    // In-memory SharedStorage singleton. Mirrors just enough of Mongoose for
    // the orchestrator's findById / create / updateOne.
    docStore = { current: null };
    const sharedStorageModel = {
      findById: jest.fn(() => ({
        lean: () => ({ exec: () => Promise.resolve(docStore.current) }),
      })),
      create: jest.fn((doc: Record<string, unknown>) => {
        docStore.current = { ...doc };
        return Promise.resolve(doc);
      }),
      updateOne: jest.fn((_filter, update: { $set?: Record<string, unknown> }) => ({
        exec: () => {
          const set = update.$set ?? {};
          docStore.current = { ...(docStore.current ?? {}), ...set };
          return Promise.resolve({ acknowledged: true });
        },
      })),
    };

    mongoAudit = jest.fn().mockResolvedValue({ _id: 'x' });

    const mod = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true })],
      providers: [
        InstallOrchestratorService,
        NodeExecClient,
        StorageAuditService,
        DriverRegistry,
        SeaweedfsDriver,
        NfsDriver,
        { provide: ConsumerInspectorService, useValue: inspectorStub },
        EventEmitter2,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              if (key === 'AGENT_HMAC_SECRET') return HMAC_SECRET;
              if (key === 'AGENT_WS_URL_TEMPLATE')
                return `ws://127.0.0.1:${agent.port}/node-exec`;
              if (key === 'AGENT_WS_INSECURE') return 'true';
              if (key === 'AGENT_WS_TIMEOUT_MS') return '5000';
              if (key === 'STORAGE_AUDIT_FILE_MIRROR') return 'false';
              return fallback ?? '';
            }),
          },
        },
        {
          provide: getModelToken(SharedStorage.name),
          useValue: sharedStorageModel,
        },
        {
          provide: getModelToken(StorageAuditLog.name),
          useValue: { create: mongoAudit },
        },
      ],
    }).compile();

    orchestrator = mod.get(InstallOrchestratorService);
    const emitter = mod.get(EventEmitter2);
    frames = [];
    emitter.on(STORAGE_INSTALL_EVENT, (f: StorageInstallStepEvent) => frames.push(f));
  });

  afterEach(async () => {
    await agent.close();
  });

  it('runs the full SeaweedFS install plan end-to-end against a mock agent', async () => {
    const config: SharedStorageConfig = {
      backend: 'seaweedfs',
      nodes: ['node02', 'node03'],
      mountPoint: '/var/lib/swarmui/shared',
      insecure: true, // skip the tls-bootstrap step
    };
    await orchestrator.run('sess-int-1', config, 'alice');

    // State
    expect((docStore.current as { state: string }).state).toBe('HEALTHY');
    expect((docStore.current as { installSessionId: string }).installSessionId).toBe('sess-int-1');

    // Agent received a request per plan step and verified every one.
    expect(agentAudit).toHaveBeenCalled();
    const verdicts = agentAudit.mock.calls.map((c) => c[0].verdict);
    expect(verdicts.every((v) => v === 'ok')).toBe(true);

    // Audit was written once per plan step.
    const expectedSteps = agentAudit.mock.calls.length;
    expect(mongoAudit).toHaveBeenCalledTimes(expectedSteps);

    // Event trail: started + N steps + done.
    expect(frames[0].phase).toBe('started');
    expect(frames[frames.length - 1].phase).toBe('done');
    expect(frames[frames.length - 1].state).toBe('HEALTHY');
    const stepFrames = frames.filter((f) => f.phase === 'step');
    expect(stepFrames).toHaveLength(expectedSteps);
    expect(stepFrames.every((f) => f.exitCode === 0)).toBe(true);
  }, 15000);

  it('agent rejects a tampered request → orchestrator ends in UNINSTALL_FAILED', async () => {
    // Build the module again but with a client whose secret differs from
    // the agent's; every request will hmac-reject at the agent.
    const docStoreLocal = { current: null as Record<string, unknown> | null };
    const sharedStorageModel = {
      findById: jest.fn(() => ({
        lean: () => ({ exec: () => Promise.resolve(docStoreLocal.current) }),
      })),
      create: jest.fn((doc: Record<string, unknown>) => {
        docStoreLocal.current = { ...doc };
        return Promise.resolve(doc);
      }),
      updateOne: jest.fn((_f, u: { $set?: Record<string, unknown> }) => ({
        exec: () => {
          docStoreLocal.current = { ...(docStoreLocal.current ?? {}), ...(u.$set ?? {}) };
          return Promise.resolve({ acknowledged: true });
        },
      })),
    };
    const mod = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true })],
      providers: [
        InstallOrchestratorService,
        NodeExecClient,
        StorageAuditService,
        DriverRegistry,
        SeaweedfsDriver,
        NfsDriver,
        { provide: ConsumerInspectorService, useValue: inspectorStub },
        EventEmitter2,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              if (key === 'AGENT_HMAC_SECRET') return 'C'.repeat(48); // wrong secret
              if (key === 'AGENT_WS_URL_TEMPLATE')
                return `ws://127.0.0.1:${agent.port}/node-exec`;
              if (key === 'AGENT_WS_INSECURE') return 'true';
              if (key === 'AGENT_WS_TIMEOUT_MS') return '2000';
              if (key === 'STORAGE_AUDIT_FILE_MIRROR') return 'false';
              return fallback ?? '';
            }),
          },
        },
        {
          provide: getModelToken(SharedStorage.name),
          useValue: sharedStorageModel,
        },
        {
          provide: getModelToken(StorageAuditLog.name),
          useValue: { create: jest.fn().mockResolvedValue({ _id: 'x' }) },
        },
      ],
    }).compile();
    const o = mod.get(InstallOrchestratorService);
    const localFrames: StorageInstallStepEvent[] = [];
    mod.get(EventEmitter2).on(STORAGE_INSTALL_EVENT, (f: StorageInstallStepEvent) => localFrames.push(f));

    await o.run('sess-tampered', {
      backend: 'seaweedfs',
      nodes: ['node02', 'node03'],
      mountPoint: '/var/lib/swarmui/shared',
      insecure: true,
    }, 'alice');

    expect((docStoreLocal.current as { state: string }).state).toBe('UNINSTALL_FAILED');
    const terminal = localFrames[localFrames.length - 1];
    expect(terminal.phase).toBe('failed');
    expect(terminal.cause).toMatch(/hmac reject/);
  }, 15000);
});
