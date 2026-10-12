import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  STORAGE_CONSUMER_DRIFT_EVENT,
  STORAGE_STATE_TRANSITION_EVENT,
  type SharedStorageConfig,
  type StorageConsumerDriftEvent,
  type StorageState,
  type StorageStateTransitionEvent,
} from '@swarmui-master/storage-plan';
import {
  SharedStorage,
  SharedStorageDocument,
} from './schemas/shared-storage.schema';
import { DriverRegistry } from './drivers/driver.registry';
import { StorageStateMachine } from './state-machine';

// Reconciler (Sprint 1 seam → Sprint 4 D3 drift detection).
//
// Fires every minute. For a HEALTHY install, computes the current consumer
// set via driver.enumerateConsumers() and compares it to the lastKnown set
// stored on the SharedStorage doc. If the set changed, emits a
// `storage.consumer.drift` event with the added/removed deltas and persists
// the new snapshot.
//
// Why in-process event, not SSE: drift events feed alerting /
// dashboarding and operator ops hooks — the install SSE stream is
// per-session and belongs to the install page. A sibling listener on
// EventEmitter2 can forward drift to Prometheus, Slack, etc. without
// touching the install controller.
//
// Behavior still owned by Sprint 5:
//   - state transitions on health failures (HEALTHY → DEGRADED).
//   - automatic retry of a mid-install resume.
// This file only snapshots the consumer set; the state machine stays put.
@Injectable()
export class StorageReconcilerService {
  private readonly logger = new Logger(StorageReconcilerService.name);
  private static readonly PRIMARY_ID = 'primary';

  constructor(
    @InjectModel(SharedStorage.name)
    private readonly storageModel: Model<SharedStorageDocument>,
    private readonly drivers: DriverRegistry,
    private readonly emitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'storage-reconciler' })
  async scheduledTick(): Promise<void> {
    try {
      await this.tick();
    } catch (err) {
      // Cron must never throw — a reconciler crash would silence future ticks
      // in @nestjs/schedule's single-fire scheduler.
      this.logger.error(
        `reconciler tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // Exposed for tests and for direct invocation.
  async tick(): Promise<void> {
    const doc = await this.storageModel
      .findById(StorageReconcilerService.PRIMARY_ID)
      .lean()
      .exec();
    if (!doc) {
      this.logger.debug('no shared-storage install; skipping');
      return;
    }
    // States under the reconciler's remit: HEALTHY (drift + probe),
    // DEGRADED + RECOVERING (probe-driven recovery). Everything else
    // (PENDING, INSTALLING, DRAINING, UNINSTALLED, UNINSTALL_FAILED,
    // ADOPTING) belongs to the orchestrator / operator, so a stale
    // tick must leave those alone.
    if (
      doc.state !== 'HEALTHY' &&
      doc.state !== 'DEGRADED' &&
      doc.state !== 'RECOVERING'
    ) {
      this.logger.debug(`state=${doc.state}; reconciler skipping`);
      return;
    }

    const driver = this.drivers.get(doc.backend);
    const config = reconstructConfig(doc);

    // Health probe always runs — drives the state machine on every tick.
    const verdict = await this.safeProbe(driver, config);

    // Drift detection only runs in HEALTHY. In DEGRADED/RECOVERING the
    // consumer list is suspect (a mount client that lost the filer may
    // vanish from the swarm's view while the service spec stands) and
    // persisting a snapshot built on half-truth would mask the recovery.
    if (doc.state === 'HEALTHY') {
      const current = normalizeSet(
        await driver.enumerateConsumers(doc.mountPoint),
      );
      this.logger.log(
        `reconcile tick: backend=${doc.backend} consumers=${current.length}`,
      );
      const previous: string[] | undefined = Array.isArray(doc.lastKnownConsumers)
        ? [...doc.lastKnownConsumers].sort()
        : undefined;
      if (!setsEqual(previous, current)) {
        await this.handleDrift(doc.mountPoint, previous, current);
      }
    }

    await this.applyHealthTransition(doc.state, verdict);
  }

  // Probe wrapper that turns a throw into an ok=false verdict. The
  // state machine should drive on the probe's *answer*, not on whether
  // the probe itself crashed — a crash is just "unknown health", which
  // we treat like a failed probe for v1.
  private async safeProbe(
    driver: ReturnType<DriverRegistry['get']>,
    config: SharedStorageConfig,
  ): Promise<{ ok: boolean; cause?: string }> {
    try {
      return await driver.probeHealth(config);
    } catch (err) {
      const cause = (err as Error).message?.slice(0, 200) ?? 'probe threw';
      this.logger.warn(`probeHealth threw: ${cause}`);
      return { ok: false, cause: `probe error: ${cause}` };
    }
  }

  private async applyHealthTransition(
    from: StorageState,
    verdict: { ok: boolean; cause?: string },
  ): Promise<void> {
    const to = nextStateForVerdict(from, verdict.ok);
    if (to === undefined || to === from) return;
    // Use the state machine to validate the transition — a direct persist
    // without this would let a bug here corrupt the state.
    const sm = new StorageStateMachine(from);
    try {
      sm.transition(to);
    } catch (err) {
      this.logger.error(
        `illegal transition in reconciler: ${from} → ${to}: ${(err as Error).message}`,
      );
      return;
    }
    await this.storageModel
      .updateOne(
        { _id: StorageReconcilerService.PRIMARY_ID },
        {
          $set: { state: to, lastHealthCheckAt: new Date() },
        },
      )
      .exec();
    const event: StorageStateTransitionEvent = {
      from,
      to,
      cause: verdict.ok ? undefined : verdict.cause,
      ts: new Date().toISOString(),
    };
    this.emitter.emit(STORAGE_STATE_TRANSITION_EVENT, event);
    this.logger.log(
      `state transition ${from} → ${to}${verdict.cause ? ': ' + verdict.cause : ''}`,
    );
  }

  private async handleDrift(
    mountPoint: string,
    previous: string[] | undefined,
    current: string[],
  ): Promise<void> {
    // First-ever tick (previous undefined) persists the snapshot without
    // firing an event — "N services appeared" on first boot is noise, not
    // drift.
    if (previous === undefined) {
      await this.persistSnapshot(current);
      this.logger.log(
        `consumer snapshot initialized: ${current.length} consumer(s)`,
      );
      return;
    }

    const prevSet = new Set(previous);
    const currSet = new Set(current);
    const added = current.filter((c) => !prevSet.has(c));
    const removed = previous.filter((c) => !currSet.has(c));

    const event: StorageConsumerDriftEvent = {
      mountPoint,
      consumers: current,
      added,
      removed,
      ts: new Date().toISOString(),
    };
    this.emitter.emit(STORAGE_CONSUMER_DRIFT_EVENT, event);
    this.logger.log(
      `consumer drift: +${added.length} -${removed.length} ` +
        `(now ${current.length}); added=[${added.join(',')}] removed=[${removed.join(',')}]`,
    );
    await this.persistSnapshot(current);
  }

  private async persistSnapshot(consumers: string[]): Promise<void> {
    await this.storageModel
      .updateOne(
        { _id: StorageReconcilerService.PRIMARY_ID },
        {
          $set: {
            lastKnownConsumers: consumers,
            lastConsumerDriftAt: new Date(),
          },
        },
      )
      .exec();
  }
}

// Sort + dedupe so the set comparison is order-independent — the driver's
// list is deterministic in v1 but we don't want to depend on it.
function normalizeSet(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

function setsEqual(a: string[] | undefined, b: string[]): boolean {
  if (a === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Reconstructs the SharedStorageConfig the driver needs for probeHealth.
// We don't persist the full install dto; nodes + backend + mountPoint land
// on the top-level fields, and `insecure` is stashed in driverOpts by the
// install plan — see seaweedfs.driver.ts §driverOpts. If the install
// predates driverOpts.insecure (test fixtures), probe defaults to secure.
function reconstructConfig(doc: {
  backend: SharedStorageConfig['backend'];
  nodes: string[];
  mountPoint: string;
  driverOpts?: Record<string, unknown>;
}): SharedStorageConfig {
  const insecure = Boolean(
    (doc.driverOpts as { insecure?: unknown })?.insecure,
  );
  return {
    backend: doc.backend,
    nodes: doc.nodes,
    mountPoint: doc.mountPoint,
    insecure,
  };
}

// Flap-resistant two-tick recovery:
//   HEALTHY     + probe ok  → stay
//   HEALTHY     + probe bad → DEGRADED
//   DEGRADED    + probe ok  → RECOVERING   (don't flip straight back)
//   DEGRADED    + probe bad → stay
//   RECOVERING  + probe ok  → HEALTHY
//   RECOVERING  + probe bad → DEGRADED
// undefined → no transition.
export function nextStateForVerdict(
  from: StorageState,
  ok: boolean,
): StorageState | undefined {
  if (from === 'HEALTHY') return ok ? undefined : 'DEGRADED';
  if (from === 'DEGRADED') return ok ? 'RECOVERING' : undefined;
  if (from === 'RECOVERING') return ok ? 'HEALTHY' : 'DEGRADED';
  return undefined;
}
