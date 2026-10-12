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

const PRIMARY = 'primary';

function makeModel(initial: Record<string, unknown> | null) {
  const store: { current: Record<string, unknown> | null } = { current: initial };
  return {
    store,
    model: {
      findById: jest.fn((_id: string) => ({
        lean: () => ({ exec: () => Promise.resolve(store.current) }),
      })),
      updateOne: jest.fn(),
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
    'UNINSTALL_FAILED',
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

  it('refuses with the consumer list when at least one service bind-mounts the path', async () => {
    const { model } = makeModel({
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
