import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { DriverRegistry } from './drivers/driver.registry';
import { StorageReconcilerService } from './reconciler.service';
import { SharedStorage } from './schemas/shared-storage.schema';

// Smoke tests for the reconciler stub. Guards the Sprint 5 seam:
//   - no doc → noop
//   - state ≠ HEALTHY → noop (S5 owns recovery)
//   - state = HEALTHY → calls driver.enumerateConsumers
//   - scheduledTick never throws, even if tick() does

describe('StorageReconcilerService', () => {
  const findById = jest.fn();
  const enumerateConsumers = jest.fn().mockResolvedValue(['stack-a']);
  const driverRegistryGet = jest.fn().mockReturnValue({
    backend: 'seaweedfs',
    plan: jest.fn(),
    uninstallPlan: jest.fn(),
    enumerateConsumers,
  });

  let service: StorageReconcilerService;

  beforeEach(async () => {
    findById.mockReset();
    enumerateConsumers.mockClear();
    driverRegistryGet.mockClear();
    const mod = await Test.createTestingModule({
      providers: [
        StorageReconcilerService,
        {
          provide: getModelToken(SharedStorage.name),
          useValue: {
            findById: (id: string) => ({
              lean: () => ({ exec: () => findById(id) }),
            }),
          },
        },
        {
          provide: DriverRegistry,
          useValue: { get: driverRegistryGet },
        },
      ],
    }).compile();
    service = mod.get(StorageReconcilerService);
  });

  it('is a no-op when no shared-storage install exists', async () => {
    findById.mockResolvedValue(null);
    await service.tick();
    expect(driverRegistryGet).not.toHaveBeenCalled();
    expect(enumerateConsumers).not.toHaveBeenCalled();
  });

  it('is a no-op when state is not HEALTHY (S5 owns recovery)', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'INSTALLING',
      mountPoint: '/var/lib/swarmui/shared',
    });
    await service.tick();
    expect(driverRegistryGet).not.toHaveBeenCalled();
    expect(enumerateConsumers).not.toHaveBeenCalled();
  });

  it('enumerates consumers when state is HEALTHY', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
    });
    await service.tick();
    expect(driverRegistryGet).toHaveBeenCalledWith('seaweedfs');
    expect(enumerateConsumers).toHaveBeenCalledWith('/var/lib/swarmui/shared');
  });

  it('swallows errors in scheduledTick so cron keeps firing', async () => {
    findById.mockRejectedValue(new Error('mongo down'));
    await expect(service.scheduledTick()).resolves.toBeUndefined();
  });
});
