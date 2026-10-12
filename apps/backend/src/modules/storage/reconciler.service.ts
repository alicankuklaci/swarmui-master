import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SharedStorage,
  SharedStorageDocument,
} from './schemas/shared-storage.schema';
import { DriverRegistry } from './drivers/driver.registry';

// Reconciler stub (Sprint 1 seam). The real drift detection + state machine
// transitions land in Sprint 5. For now this exists so:
//
//   1. The DI graph is complete (nothing new to wire when S5 ships).
//   2. The cron slot is reserved (operators see the service in Prometheus
//      labels from day one; alerting rules don't need a new label later).
//   3. Driver stubs are reachable through enumerateConsumers so the integration
//      path is validated end-to-end before the installer exists.
//
// Behavior:
//   - If no SharedStorage singleton exists → noop (feature flag on but never
//     installed).
//   - If state is HEALTHY → log consumer count. The S5 implementation turns
//     this into drift detection + state transitions.
//   - Any other state → log and leave untouched; S5 owns recovery.
@Injectable()
export class StorageReconcilerService {
  private readonly logger = new Logger(StorageReconcilerService.name);

  constructor(
    @InjectModel(SharedStorage.name)
    private readonly storageModel: Model<SharedStorageDocument>,
    private readonly drivers: DriverRegistry,
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
    const doc = await this.storageModel.findById('primary').lean().exec();
    if (!doc) {
      this.logger.debug('no shared-storage install; skipping');
      return;
    }
    if (doc.state !== 'HEALTHY') {
      this.logger.debug(`state=${doc.state}; S5 will drive recovery`);
      return;
    }
    const driver = this.drivers.get(doc.backend);
    const consumers = await driver.enumerateConsumers(doc.mountPoint);
    this.logger.log(
      `reconcile tick: backend=${doc.backend} consumers=${consumers.length}`,
    );
  }
}
