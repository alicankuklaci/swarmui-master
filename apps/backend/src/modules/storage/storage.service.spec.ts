import { ConflictException, NotFoundException } from '@nestjs/common';
import type { StorageState } from '@swarmui-master/storage-plan';
import { DriverRegistry } from './drivers/driver.registry';
import { InstallOrchestratorService } from './install-orchestrator.service';
import { StorageService } from './storage.service';

// Pure StorageService unit tests. Validates the Sprint 4 queueUninstall
// preconditions: install must exist; must be in a tear-down-safe state;
// and no services can still bind-mount the shared path. The driver +
// orchestrator are mocked — this test is about guard order, not install
// mechanics.
//
// A pack #11: the acquire is now atomic (findOneAndUpdate) and the
// consumer check runs *inside* the DRAINING lock, rolling back on refusal.
// The mock below is filter-aware so we can test the lock sequence.

const PRIMARY = 'primary';

// Lightweight filter matcher. Supports top-level equality and {$in: [...]}.
// _id is treated as implicit (we only ever address the singleton), so the
// filter's _id key is ignored.
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

function makeModel(initial: Record<string, unknown> | null) {
  const store: { current: Record<string, unknown> | null } = { current: initial };
  return {
    store,
    model: {
      findById: jest.fn((_id: string) => ({
        lean: () => ({ exec: () => Promise.resolve(store.current) }),
      })),
      findOneAndUpdate: jest.fn(
        (
          filter: Record<string, unknown>,
          update: { $set?: Record<string, unknown> },
          options?: { new?: boolean },
        ) => {
          const run = () => {
            if (!filterMatches(store.current, filter)) {
              return Promise.resolve(null);
            }
            const prev = { ...(store.current as Record<string, unknown>) };
            store.current = { ...prev, ...(update.$set ?? {}) };
            return Promise.resolve(options?.new ? store.current : prev);
          };
          return { lean: () => ({ exec: run }), exec: run };
        },
      ),
      updateOne: jest.fn(
        (
          filter: Record<string, unknown>,
          update: { $set?: Record<string, unknown> },
        ) => ({
          exec: () => {
            if (!filterMatches(store.current, filter)) {
              return Promise.resolve({
                acknowledged: true,
                matchedCount: 0,
                modifiedCount: 0,
              });
            }
            store.current = {
              ...(store.current as Record<string, unknown>),
              ...(update.$set ?? {}),
            };
            return Promise.resolve({
              acknowledged: true,
              matchedCount: 1,
              modifiedCount: 1,
            });
          },
        }),
      ),
      create: jest.fn(),
    },
  };
}

function makeDriver(consumers: string[]) {
  return {
    enumerateConsumers: jest.fn().mockResolvedValue(consumers),
    plan: jest.fn(),
    uninstallPlan: jest.fn(),
    backend: 'seaweedfs' as const,
  };
}

function makeOrchestrator() {
  return {
    uninstall: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined),
  };
}

describe('StorageService.queueUninstall', () => {
  it('rejects with NotFoundException when no shared storage is installed', async () => {
    const { model } = makeModel(null);
    const driver = makeDriver([]);
    const registry = { get: jest.fn().mockReturnValue(driver) };
    const svc = new StorageService(
      model as never,
      makeOrchestrator() as unknown as InstallOrchestratorService,
      registry as unknown as DriverRegistry,
    );
    await expect(svc.queueUninstall('alice')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(driver.enumerateConsumers).not.toHaveBeenCalled();
  });

  it.each([
    'PENDING',
    'INSTALLING',
    'ADOPTING',
    'DRAINING',
    'UNINSTALLED',
    // UNINSTALL_FAILED intentionally removed — Sprint 8 security fix: the
    // FSM allows UNINSTALL_FAILED → DRAINING retry and the service now
    // exposes it so operators can recover from a half-finished teardown.
    'RECOVERING',
  ] satisfies StorageState[])(
    'rejects with ConflictException when state is %s',
    async (state) => {
      const { model } = makeModel({ _id: PRIMARY, state, backend: 'seaweedfs', nodes: ['n02'], mountPoint: '/x' });
      const driver = makeDriver([]);
      const registry = { get: jest.fn().mockReturnValue(driver) };
      const svc = new StorageService(
        model as never,
        makeOrchestrator() as unknown as InstallOrchestratorService,
        registry as unknown as DriverRegistry,
      );
      await expect(svc.queueUninstall('alice')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(driver.enumerateConsumers).not.toHaveBeenCalled();
    },
  );

  it('refuses with the consumer list when at least one service bind-mounts the path, and rolls back DRAINING to prior state', async () => {
    const { store, model } = makeModel({
      _id: PRIMARY,
      state: 'HEALTHY',
      backend: 'seaweedfs',
      nodes: ['n02', 'n03'],
      mountPoint: '/var/lib/swarmui/shared',
    });
    const driver = makeDriver(['web', 'api']);
    const registry = { get: jest.fn().mockReturnValue(driver) };
    const orchestrator = makeOrchestrator();
    const svc = new StorageService(
      model as never,
      orchestrator as unknown as InstallOrchestratorService,
      registry as unknown as DriverRegistry,
    );
    await expect(svc.queueUninstall('alice')).rejects.toMatchObject({
      response: {
        message: 'shared storage has active consumers',
        consumers: ['web', 'api'],
        mountPoint: '/var/lib/swarmui/shared',
      },
    });
    expect(orchestrator.uninstall).not.toHaveBeenCalled();
    expect(driver.enumerateConsumers).toHaveBeenCalledWith(
      '/var/lib/swarmui/shared',
    );
    // Rollback: the acquire wrote DRAINING, the consumer refusal must
    // revert it. If the state is still DRAINING we've left the install in
    // a state the operator can't easily recover from.
    expect(store.current?.state).toBe('HEALTHY');
  });

  it('rolls back from DEGRADED after a consumer refusal (not back to HEALTHY)', async () => {
    const { store, model } = makeModel({
      _id: PRIMARY,
      state: 'DEGRADED',
      backend: 'seaweedfs',
      nodes: ['n02'],
      mountPoint: '/x',
    });
    const driver = makeDriver(['web']);
    const registry = { get: jest.fn().mockReturnValue(driver) };
    const svc = new StorageService(
      model as never,
      makeOrchestrator() as unknown as InstallOrchestratorService,
      registry as unknown as DriverRegistry,
    );
    await expect(svc.queueUninstall('alice')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(store.current?.state).toBe('DEGRADED');
  });

  it('rolls back and surfaces the error when enumerate throws inside the DRAINING lock', async () => {
    const { store, model } = makeModel({
      _id: PRIMARY,
      state: 'HEALTHY',
      backend: 'seaweedfs',
      nodes: ['n02'],
      mountPoint: '/x',
    });
    const driver = {
      enumerateConsumers: jest.fn().mockRejectedValue(new Error('docker API down')),
      plan: jest.fn(),
      uninstallPlan: jest.fn(),
      backend: 'seaweedfs' as const,
    };
    const registry = { get: jest.fn().mockReturnValue(driver) };
    const svc = new StorageService(
      model as never,
      makeOrchestrator() as unknown as InstallOrchestratorService,
      registry as unknown as DriverRegistry,
    );
    await expect(svc.queueUninstall('alice')).rejects.toThrow('docker API down');
    expect(store.current?.state).toBe('HEALTHY');
  });

  it('fires orchestrator.uninstall and returns the session id when state=HEALTHY and consumers=[]', async () => {
    const { model } = makeModel({
      _id: PRIMARY,
      state: 'HEALTHY',
      backend: 'seaweedfs',
      nodes: ['n02', 'n03'],
      mountPoint: '/var/lib/swarmui/shared',
    });
    const driver = makeDriver([]);
    const registry = { get: jest.fn().mockReturnValue(driver) };
    const orchestrator = makeOrchestrator();
    const svc = new StorageService(
      model as never,
      orchestrator as unknown as InstallOrchestratorService,
      registry as unknown as DriverRegistry,
    );
    const { installSessionId } = await svc.queueUninstall('alice');
    expect(installSessionId).toMatch(/^[0-9a-f-]{36}$/);
    // Fire-and-forget — the controller returned before the orchestrator
    // resolved. Let the microtask flush so we can assert on the call.
    await new Promise((r) => setImmediate(r));
    expect(orchestrator.uninstall).toHaveBeenCalledTimes(1);
    const [sessionArg, configArg, whoArg] = orchestrator.uninstall.mock.calls[0];
    expect(sessionArg).toBe(installSessionId);
    expect(configArg).toMatchObject({
      backend: 'seaweedfs',
      nodes: ['n02', 'n03'],
      mountPoint: '/var/lib/swarmui/shared',
      insecure: true,
    });
    expect(whoArg).toBe('alice');
  });

  it('refuses a second queueUninstall after the first acquired DRAINING', async () => {
    // A pack #11 regression guard: the atomic acquire must prevent two
    // concurrent uninstalls from both marching into orchestrator.uninstall.
    // The mock serializes awaits, so the second call sees state=DRAINING
    // and must refuse with ConflictException naming that state.
    const { store, model } = makeModel({
      _id: PRIMARY,
      state: 'HEALTHY',
      backend: 'seaweedfs',
      nodes: ['n02'],
      mountPoint: '/x',
    });
    const driver = makeDriver([]);
    const registry = { get: jest.fn().mockReturnValue(driver) };
    const orchestrator = makeOrchestrator();
    const svc = new StorageService(
      model as never,
      orchestrator as unknown as InstallOrchestratorService,
      registry as unknown as DriverRegistry,
    );
    await svc.queueUninstall('alice');
    expect(store.current?.state).toBe('DRAINING');
    await expect(svc.queueUninstall('bob')).rejects.toThrow(
      /state is DRAINING/,
    );
    // Only the first call reached the orchestrator.
    await new Promise((r) => setImmediate(r));
    expect(orchestrator.uninstall).toHaveBeenCalledTimes(1);
  });

  it('also allows DEGRADED → DRAINING teardown', async () => {
    const { model } = makeModel({
      _id: PRIMARY,
      state: 'DEGRADED',
      backend: 'seaweedfs',
      nodes: ['n02'],
      mountPoint: '/var/lib/swarmui/shared',
    });
    const driver = makeDriver([]);
    const registry = { get: jest.fn().mockReturnValue(driver) };
    const orchestrator = makeOrchestrator();
    const svc = new StorageService(
      model as never,
      orchestrator as unknown as InstallOrchestratorService,
      registry as unknown as DriverRegistry,
    );
    await expect(svc.queueUninstall('alice')).resolves.toMatchObject({
      installSessionId: expect.any(String),
    });
    await new Promise((r) => setImmediate(r));
    expect(orchestrator.uninstall).toHaveBeenCalledTimes(1);
  });
});
