import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  STORAGE_CONSUMER_DRIFT_EVENT,
  type StorageConsumerDriftEvent,
} from '@swarmui-master/storage-plan';
import {
  SharedStorage,
  SharedStorageDocument,
} from './schemas/shared-storage.schema';
import { DriverRegistry } from './drivers/driver.registry';

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

  // Exposed for tests and for the S5 implementation to call directly.
  async tick(): Promise<void> {
    const doc = await this.storageModel
      .findById(StorageReconcilerService.PRIMARY_ID)
      .lean()
      .exec();
    if (!doc) {
      this.logger.debug('no shared-storage install; skipping');
      return;
    }
    if (doc.state !== 'HEALTHY') {
      this.logger.debug(`state=${doc.state}; S5 will drive recovery`);
      return;
    }

    const driver = this.drivers.get(doc.backend);
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
