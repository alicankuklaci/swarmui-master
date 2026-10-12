import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type { SharedStorageConfig } from '@swarmui-master/storage-plan';
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

  async queueUninstall(_initiatedBy: string): Promise<{ installSessionId: string }> {
    throw new NotImplementedException(
      'storage uninstall orchestration lands in Sprint 4',
    );
  }
}
