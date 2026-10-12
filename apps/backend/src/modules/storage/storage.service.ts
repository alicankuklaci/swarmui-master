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

  // Sprint 4: real uninstall orchestration. Preconditions enforced here
  // because the orchestrator trusts its caller — one place to say "no, there
  // are still services bind-mounting this".
  async queueUninstall(
    initiatedBy: string,
  ): Promise<{ installSessionId: string }> {
    const doc = await this.storageModel
      .findById(StorageService.PRIMARY_ID)
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException('shared storage is not installed');
    }
    // DRAINING / UNINSTALLED / UNINSTALL_FAILED / PENDING / INSTALLING /
    // ADOPTING / RECOVERING all refuse. Only a running install we can tear
    // down (HEALTHY) or a damaged one with human sign-off (DEGRADED) are
    // valid. Operators who want to force a teardown from UNINSTALL_FAILED
    // must flip through DRAINING manually first (Sprint 5 wires that path).
    if (doc.state !== 'HEALTHY' && doc.state !== 'DEGRADED') {
      throw new ConflictException(
        `cannot uninstall while state is ${doc.state}`,
      );
    }

    const driver = this.drivers.get(doc.backend);
    const consumers = await driver.enumerateConsumers(doc.mountPoint);
    if (consumers.length > 0) {
      // Surface the list in both the thrown response and the log — operators
      // reading /var/log should see which services are blocking without
      // tailing another endpoint.
      this.logger.warn(
        `uninstall refused: ${consumers.length} consumer(s) bind-mount ${doc.mountPoint}: ${consumers.join(', ')}`,
      );
      throw new ConflictException({
        message: 'shared storage has active consumers',
        consumers,
        mountPoint: doc.mountPoint,
      });
    }

    const installSessionId = uuidv4();
    // Uninstall plan doesn't need the install-time knobs (replication etc.);
    // only the backend + the host list + mountPoint drive the teardown.
    // `insecure: true` on the uninstall path skips the TLS cert cleanup step
    // for v1 — matches the install default. Sprint 7 wires TLS teardown.
    const config: SharedStorageConfig = {
      backend: doc.backend,
      nodes: doc.nodes,
      mountPoint: doc.mountPoint,
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
}
