import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type { SharedStorageConfig } from '@swarmui-master/storage-plan';
import { DriverRegistry } from './drivers/driver.registry';
import { InstallOrchestratorService } from './install-orchestrator.service';
import {
  SharedStorage,
  SharedStorageDocument,
} from './schemas/shared-storage.schema';
import { InstallStorageDto } from './dto/install-storage.dto';

// Thin facade over the SharedStorage singleton. Sprint 2 wires `queueInstall`
// to the orchestrator (fire-and-forget — HTTP returns immediately with the
// install session id; progress is read via SSE). Uninstall still throws
// NotImplementedException until Sprint 4 lands the destructive teardown.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  // Singleton document id. See schemas/shared-storage.schema.ts comment.
  private static readonly PRIMARY_ID = 'primary';

  constructor(
    @InjectModel(SharedStorage.name)
    private readonly storageModel: Model<SharedStorageDocument>,
    private readonly orchestrator: InstallOrchestratorService,
    private readonly drivers: DriverRegistry,
  ) {}

  async getStatus(): Promise<SharedStorage | null> {
    const doc = await this.storageModel
      .findById(StorageService.PRIMARY_ID)
      .lean()
      .exec();
    return (doc as SharedStorage | null) ?? null;
  }

  async queueInstall(
    dto: InstallStorageDto,
    initiatedBy: string,
  ): Promise<{ installSessionId: string }> {
    const installSessionId = uuidv4();
    const config: SharedStorageConfig = {
      backend: dto.backend,
      nodes: dto.nodes,
      mountPoint: '/var/lib/swarmui/shared',
      nfsServerNode: dto.nfsServerNode,
      replication: dto.replication,
      insecure: dto.insecure,
    };
    // Fire-and-forget. The orchestrator never throws (converts errors into
    // `failed` events + UNINSTALL_FAILED state), but we still catch here so
    // a Promise rejection during a microtask doesn't crash the process.
    void this.orchestrator
      .run(installSessionId, config, initiatedBy)
      .catch((err) => {
        this.logger.error(
          `orchestrator.run(${installSessionId}) threw after swallow: ${(err as Error).message}`,
          (err as Error).stack,
        );
      });
    return { installSessionId };
  }

  // Sprint 4: real uninstall orchestration. A pack #11 fix: previously this
  // was check-then-act (findById → enumerate → updateOne), which left a
  // window between enumerate and the orchestrator's DRAINING persist where
  // a new service could bind-mount and then get torn out from under it.
  //
  // The flow now atomically acquires DRAINING via a compound-filter
  // findOneAndUpdate *before* enumerating. The reconciler and any
  // concurrent install/uninstall observe state=DRAINING and refuse. If the
  // enumerate inside the lock finds consumers, we roll back to the
  // pre-acquire state and throw.
  async queueUninstall(
    initiatedBy: string,
  ): Promise<{ installSessionId: string }> {
    const installSessionId = uuidv4();

    // Atomic acquire: HEALTHY | DEGRADED | UNINSTALL_FAILED → DRAINING.
    // Any other state fails the filter and `acquired` is null. The
    // UNINSTALL_FAILED path lets an operator retry a half-finished
    // teardown after fixing the host (orphaned container, busy mount);
    // the FSM has explicitly allowed UNINSTALL_FAILED → DRAINING since
    // Sprint 2 but queueUninstall didn't expose it, leaving operators
    // staring at a dead-end state with no API-level recovery.
    const acquired = await this.storageModel
      .findOneAndUpdate(
        {
          _id: StorageService.PRIMARY_ID,
          state: { $in: ['HEALTHY', 'DEGRADED', 'UNINSTALL_FAILED'] },
        },
        {
          $set: {
            state: 'DRAINING',
            installSessionId,
            lastAttemptedStepId: null,
          },
        },
        { new: false },
      )
      .lean()
      .exec();

    if (!acquired) {
      const current = await this.storageModel
        .findById(StorageService.PRIMARY_ID)
        .lean()
        .exec();
      if (!current) {
        throw new NotFoundException('shared storage is not installed');
      }
      throw new ConflictException(
        `cannot uninstall while state is ${current.state}`,
      );
    }

    // Filter guaranteed state ∈ {HEALTHY, DEGRADED}; narrow for rollback helper.
    // Filter guaranteed state ∈ {HEALTHY, DEGRADED, UNINSTALL_FAILED}; narrow
    // for rollback helper.
    const prevState = acquired.state as 'HEALTHY' | 'DEGRADED' | 'UNINSTALL_FAILED';

    // Enumerate inside the DRAINING lock. Anything that bind-mounts after
    // this point is the operator's problem — they attempted a mount while
    // the admin had initiated a teardown. The old check-then-act allowed a
    // service that joined between enumerate and persist to be silently
    // destroyed; this ordering surfaces it.
    const driver = this.drivers.get(acquired.backend);
    let consumers: string[];
    try {
      consumers = await driver.enumerateConsumers(acquired.mountPoint);
    } catch (err) {
      // Enumerate failure means we don't know whether consumers exist, so
      // the safe move is to roll back and surface. Guard the rollback with
      // the compound filter + session id so we don't clobber a state the
      // reconciler or an operator moved us into.
      await this.rollbackDraining(installSessionId, prevState);
      this.logger.error(
        `uninstall acquire: enumerate failed, rolled back to ${prevState}: ${(err as Error).message}`,
      );
      throw err;
    }

    if (consumers.length > 0) {
      await this.rollbackDraining(installSessionId, prevState);
      this.logger.warn(
        `uninstall refused: ${consumers.length} consumer(s) bind-mount ${acquired.mountPoint}: ${consumers.join(', ')}`,
      );
      throw new ConflictException({
        message: 'shared storage has active consumers',
        consumers,
        mountPoint: acquired.mountPoint,
      });
    }

    // Uninstall plan doesn't need the install-time knobs (replication etc.);
    // only the backend + the host list + mountPoint drive the teardown.
    // `insecure: true` on the uninstall path skips the TLS cert cleanup step
    // for v1 — matches the install default. Sprint 7 wires TLS teardown.
    const config: SharedStorageConfig = {
      backend: acquired.backend,
      nodes: acquired.nodes,
      mountPoint: acquired.mountPoint,
      insecure: true,
    };
    void this.orchestrator
      .uninstall(installSessionId, config, initiatedBy)
      .catch((err) => {
        this.logger.error(
          `orchestrator.uninstall(${installSessionId}) threw after swallow: ${(err as Error).message}`,
          (err as Error).stack,
        );
      });
    return { installSessionId };
  }

  // Rollback helper for queueUninstall. Only reverts if the doc is still
  // the DRAINING state we acquired for this session — a reconciler or
  // competing uninstall that moved on in between gets to keep the state
  // it moved to. In the worst case rollback is a no-op and the operator
  // sees the doc in a different state via the state transition event.
  private async rollbackDraining(
    installSessionId: string,
    prevState: 'HEALTHY' | 'DEGRADED' | 'UNINSTALL_FAILED',
  ): Promise<void> {
    const res = await this.storageModel
      .updateOne(
        {
          _id: StorageService.PRIMARY_ID,
          state: 'DRAINING',
          installSessionId,
        },
        { $set: { state: prevState } },
      )
      .exec();
    if ((res.matchedCount ?? 0) === 0) {
      this.logger.warn(
        `uninstall rollback skipped: DRAINING lock already released for session ${installSessionId}`,
      );
    }
  }
}
