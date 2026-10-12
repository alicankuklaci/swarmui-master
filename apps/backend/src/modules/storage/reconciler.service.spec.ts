import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import {
  STORAGE_CONSUMER_DRIFT_EVENT,
  STORAGE_STATE_TRANSITION_EVENT,
  type StorageConsumerDriftEvent,
  type StorageStateTransitionEvent,
} from '@swarmui-master/storage-plan';
import { DriverRegistry } from './drivers/driver.registry';
import {
  nextStateForVerdict,
  StorageReconcilerService,
} from './reconciler.service';
import { SharedStorage } from './schemas/shared-storage.schema';

// Reconciler tests. Covers both the Sprint 1 guard behavior (no doc,
// non-HEALTHY state) and the Sprint 4 D3 drift detection: emits the
// consumer-drift event with the right added/removed deltas and
// persists the snapshot. State transitions are still Sprint 5.

describe('StorageReconcilerService', () => {
  const findById = jest.fn();
  const updateOne = jest.fn();
  const enumerateConsumers = jest.fn().mockResolvedValue(['stack-a']);
  const probeHealth = jest.fn().mockResolvedValue({ ok: true });
  const driverRegistryGet = jest.fn().mockReturnValue({
    backend: 'seaweedfs',
    plan: jest.fn(),
    uninstallPlan: jest.fn(),
    enumerateConsumers,
    probeHealth,
  });

  let service: StorageReconcilerService;
  let emitter: EventEmitter2;
  let driftFrames: StorageConsumerDriftEvent[];
  let transitionFrames: StorageStateTransitionEvent[];

  beforeEach(async () => {
    findById.mockReset();
    updateOne.mockReset().mockReturnValue({
      exec: () => Promise.resolve({ acknowledged: true }),
    });
    enumerateConsumers.mockClear();
    probeHealth.mockReset().mockResolvedValue({ ok: true });
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
    transitionFrames = [];
    emitter.on(STORAGE_CONSUMER_DRIFT_EVENT, (f: StorageConsumerDriftEvent) =>
      driftFrames.push(f),
    );
    emitter.on(
      STORAGE_STATE_TRANSITION_EVENT,
      (f: StorageStateTransitionEvent) => transitionFrames.push(f),
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

  it.each([
    'PENDING',
    'INSTALLING',
    'DRAINING',
    'UNINSTALLED',
    'UNINSTALL_FAILED',
    'ADOPTING',
  ])(
    'is a no-op when state is %s (orchestrator/operator owns the state)',
    async (state) => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state,
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
      });
      await service.tick();
      expect(driverRegistryGet).not.toHaveBeenCalled();
      expect(probeHealth).not.toHaveBeenCalled();
      expect(updateOne).not.toHaveBeenCalled();
      expect(driftFrames).toHaveLength(0);
      expect(transitionFrames).toHaveLength(0);
    },
  );

  it('enumerates consumers when state is HEALTHY', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      nodes: ['n02'],
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
      nodes: ['n02'],
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
      nodes: ['n02'],
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
    expect(updateOne).toHaveBeenCalled();
  });

  it('emits storage.consumer.drift when a service disappears', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      nodes: ['n02'],
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
      nodes: ['n02'],
      lastKnownConsumers: ['web', 'api'],
    });
    enumerateConsumers.mockResolvedValueOnce(['api', 'web']);
    await service.tick();
    expect(driftFrames).toHaveLength(0);
    // Only the state-check persist (HEALTHY + probe ok → no state transition
    // and no drift → no updateOne).
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('dedupes a driver that returned the same consumer twice', async () => {
    findById.mockResolvedValue({
      backend: 'seaweedfs',
      state: 'HEALTHY',
      mountPoint: '/var/lib/swarmui/shared',
      nodes: ['n02'],
      lastKnownConsumers: ['web'],
    });
    enumerateConsumers.mockResolvedValueOnce(['web', 'web']);
    await service.tick();
    expect(driftFrames).toHaveLength(0);
    expect(updateOne).not.toHaveBeenCalled();
  });

  // -------- Sprint 5 D2: state transitions --------

  describe('nextStateForVerdict (pure)', () => {
    it.each([
      ['HEALTHY', true, undefined],
      ['HEALTHY', false, 'DEGRADED'],
      ['DEGRADED', true, 'RECOVERING'],
      ['DEGRADED', false, undefined],
      ['RECOVERING', true, 'HEALTHY'],
      ['RECOVERING', false, 'DEGRADED'],
      ['INSTALLING', true, undefined],
      ['INSTALLING', false, undefined],
    ] as const)('%s + ok=%s → %s', (from, ok, expected) => {
      expect(nextStateForVerdict(from, ok)).toBe(expected);
    });
  });

  describe('probe-driven state transitions', () => {
    it('HEALTHY + probe fails → DEGRADED; emits storage.state.transition with cause', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'HEALTHY',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
        lastKnownConsumers: [],
      });
      enumerateConsumers.mockResolvedValueOnce([]);
      probeHealth.mockResolvedValueOnce({ ok: false, cause: 'filer HTTP 503' });
      await service.tick();
      expect(transitionFrames).toHaveLength(1);
      expect(transitionFrames[0]).toMatchObject({
        from: 'HEALTHY',
        to: 'DEGRADED',
        cause: 'filer HTTP 503',
      });
      // Latest persist should have state=DEGRADED.
      const lastSet = updateOne.mock.calls.at(-1)?.[1]?.$set;
      expect(lastSet.state).toBe('DEGRADED');
      expect(lastSet.lastHealthCheckAt).toBeInstanceOf(Date);
    });

    it('HEALTHY + probe ok → no transition and no event', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'HEALTHY',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
        lastKnownConsumers: ['stack'],
      });
      enumerateConsumers.mockResolvedValueOnce(['stack']);
      probeHealth.mockResolvedValueOnce({ ok: true });
      await service.tick();
      expect(transitionFrames).toHaveLength(0);
      // No drift, no transition → no updateOne at all.
      expect(updateOne).not.toHaveBeenCalled();
    });

    it('DEGRADED + probe ok → RECOVERING (does not jump straight to HEALTHY)', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'DEGRADED',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
      });
      probeHealth.mockResolvedValueOnce({ ok: true });
      await service.tick();
      expect(transitionFrames).toHaveLength(1);
      expect(transitionFrames[0]).toMatchObject({
        from: 'DEGRADED',
        to: 'RECOVERING',
      });
      // Drift detection is disabled outside HEALTHY — enumerateConsumers
      // must not have been called.
      expect(enumerateConsumers).not.toHaveBeenCalled();
    });

    it('DEGRADED + probe still bad → no transition (stay DEGRADED)', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'DEGRADED',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
      });
      probeHealth.mockResolvedValueOnce({ ok: false, cause: 'still broken' });
      await service.tick();
      expect(transitionFrames).toHaveLength(0);
      expect(updateOne).not.toHaveBeenCalled();
    });

    it('RECOVERING + probe ok → HEALTHY', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'RECOVERING',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
      });
      probeHealth.mockResolvedValueOnce({ ok: true });
      await service.tick();
      expect(transitionFrames).toHaveLength(1);
      expect(transitionFrames[0]).toMatchObject({
        from: 'RECOVERING',
        to: 'HEALTHY',
      });
    });

    it('RECOVERING + probe fails → DEGRADED (not stuck in RECOVERING)', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'RECOVERING',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
      });
      probeHealth.mockResolvedValueOnce({ ok: false, cause: 'flap' });
      await service.tick();
      expect(transitionFrames).toHaveLength(1);
      expect(transitionFrames[0]).toMatchObject({
        from: 'RECOVERING',
        to: 'DEGRADED',
        cause: 'flap',
      });
    });

    it('probeHealth throw is treated like ok=false; HEALTHY → DEGRADED', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'HEALTHY',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02'],
        lastKnownConsumers: [],
      });
      enumerateConsumers.mockResolvedValueOnce([]);
      probeHealth.mockRejectedValueOnce(new Error('TLS: self-signed cert'));
      await service.tick();
      expect(transitionFrames).toHaveLength(1);
      expect(transitionFrames[0].to).toBe('DEGRADED');
      expect(transitionFrames[0].cause).toContain('probe error');
      expect(transitionFrames[0].cause).toContain('self-signed cert');
    });

    it('insecure flag from driverOpts flows into the probeHealth config', async () => {
      findById.mockResolvedValue({
        backend: 'seaweedfs',
        state: 'HEALTHY',
        mountPoint: '/var/lib/swarmui/shared',
        nodes: ['n02', 'n03'],
        lastKnownConsumers: [],
        driverOpts: { insecure: true },
      });
      enumerateConsumers.mockResolvedValueOnce([]);
      probeHealth.mockResolvedValueOnce({ ok: true });
      await service.tick();
      expect(probeHealth).toHaveBeenCalledTimes(1);
      const cfg = probeHealth.mock.calls[0][0];
      expect(cfg.insecure).toBe(true);
      expect(cfg.nodes).toEqual(['n02', 'n03']);
      expect(cfg.backend).toBe('seaweedfs');
    });
  });
});
