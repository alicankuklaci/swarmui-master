import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import {
  STORAGE_CONSUMER_DRIFT_EVENT,
  type StorageConsumerDriftEvent,
} from '@swarmui-master/storage-plan';
import { DriverRegistry } from './drivers/driver.registry';
import { StorageReconcilerService } from './reconciler.service';
import { SharedStorage } from './schemas/shared-storage.schema';

// Reconciler tests. Covers both the Sprint 1 guard behavior (no doc,
// non-HEALTHY state) and the Sprint 4 D3 drift detection: emits the
// consumer-drift event with the right added/removed deltas and
// persists the snapshot. State transitions are still Sprint 5.

describe('StorageReconcilerService', () => {
  const findById = jest.fn();
  const updateOne = jest.fn();
  const enumerateConsumers = jest.fn().mockResolvedValue(['stack-a']);
  const driverRegistryGet = jest.fn().mockReturnValue({
    backend: 'seaweedfs',
    plan: jest.fn(),
    uninstallPlan: jest.fn(),
    enumerateConsumers,
  });

  let service: StorageReconcilerService;
  let emitter: EventEmitter2;
  let driftFrames: StorageConsumerDriftEvent[];

  beforeEach(async () => {
    findById.mockReset();
    updateOne.mockReset().mockReturnValue({
      exec: () => Promise.resolve({ acknowledged: true }),
    });
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
            updateOne,
          },
        },
        {
          provide: DriverRegistry,
          useValue: { get: driverRegistryGet },
        },
        EventEmitter2,
      ],
    }).compile();
    service = mod.get(StorageReconcilerService);
    emitter = mod.get(EventEmitter2);
    driftFrames = [];
    emitter.on(STORAGE_CONSUMER_DRIFT_EVENT, (f: StorageConsumerDriftEvent) =>
      driftFrames.push(f),
    );
  });

  it('is a no-op when no shared-storage install exists', async () => {
    findById.mockResolvedValue(null);
    await service.tick();
    expect(driverRegistryGet).not.toHaveBeenCalled();
    expect(enumerateConsumers).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(driftFrames).toHaveLength(0);
  });

  it('is a no-op when state is not HEALTHY (S5 owns recovery)', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'INSTALLING',
      mountPoint: '/var/lib/swarmui/shared',
    });
    await service.tick();
    expect(driverRegistryGet).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(driftFrames).toHaveLength(0);
  });

  it('enumerates consumers when state is HEALTHY', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      lastKnownConsumers: ['stack-a'], // same as current → no drift
    });
    enumerateConsumers.mockResolvedValueOnce(['stack-a']);
    await service.tick();
    expect(driverRegistryGet).toHaveBeenCalledWith('seaweedfs');
    expect(enumerateConsumers).toHaveBeenCalledWith('/var/lib/swarmui/shared');
    // No drift, so no persist and no event.
    expect(updateOne).not.toHaveBeenCalled();
    expect(driftFrames).toHaveLength(0);
  });

  it('swallows errors in scheduledTick so cron keeps firing', async () => {
    findById.mockRejectedValue(new Error('mongo down'));
    await expect(service.scheduledTick()).resolves.toBeUndefined();
  });

  it('on the first tick (lastKnownConsumers undefined), persists the snapshot without firing an event', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      // lastKnownConsumers deliberately omitted
    });
    enumerateConsumers.mockResolvedValueOnce(['web', 'api']);
    await service.tick();
    expect(driftFrames).toHaveLength(0);
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [, update] = updateOne.mock.calls[0];
    expect(update.$set.lastKnownConsumers).toEqual(['api', 'web']); // normalized
    expect(update.$set.lastConsumerDriftAt).toBeInstanceOf(Date);
  });

  it('emits storage.consumer.drift when a service appears', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      lastKnownConsumers: ['web'],
    });
    enumerateConsumers.mockResolvedValueOnce(['web', 'api']);
    await service.tick();
    expect(driftFrames).toHaveLength(1);
    expect(driftFrames[0]).toMatchObject({
      mountPoint: '/var/lib/swarmui/shared',
      consumers: ['api', 'web'],
      added: ['api'],
      removed: [],
    });
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it('emits storage.consumer.drift when a service disappears', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      lastKnownConsumers: ['web', 'api'],
    });
    enumerateConsumers.mockResolvedValueOnce(['web']);
    await service.tick();
    expect(driftFrames).toHaveLength(1);
    expect(driftFrames[0]).toMatchObject({
      consumers: ['web'],
      added: [],
      removed: ['api'],
    });
  });

  it('does not emit when the set is identical but the order differs', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      lastKnownConsumers: ['web', 'api'],
    });
    enumerateConsumers.mockResolvedValueOnce(['api', 'web']);
    await service.tick();
    expect(driftFrames).toHaveLength(0);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('dedupes a driver that returned the same consumer twice', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      lastKnownConsumers: ['web'],
    });
    enumerateConsumers.mockResolvedValueOnce(['web', 'web']);
    await service.tick();
    expect(driftFrames).toHaveLength(0);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
