import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SharedStorage,
  SharedStorageDocument,
} from './schemas/shared-storage.schema';
import { InstallStorageDto } from './dto/install-storage.dto';

// Thin facade over the SharedStorage singleton. Sprint 1 only exposes read
// access; the install/uninstall orchestration lives in Sprint 2+ (the state
// machine + driver plan execution path). The controller calls queueInstall /
// queueUninstall and those deliberately throw NotImplementedException so a
// caller gets a 501 with a clear message instead of silently queueing nothing.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  // Singleton document id. See schemas/shared-storage.schema.ts comment.
  private static readonly PRIMARY_ID = 'primary';

  constructor(
    @InjectModel(SharedStorage.name)
    private readonly storageModel: Model<SharedStorageDocument>,
  ) {}

  async getStatus(): Promise<SharedStorage | null> {
    const doc = await this.storageModel
      .findById(StorageService.PRIMARY_ID)
      .lean()
      .exec();
    return (doc as SharedStorage | null) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async queueInstall(
    _dto: InstallStorageDto,
    _initiatedBy: string,
  ): Promise<{ installSessionId: string }> {
    // Sprint 2 lands the planner + state machine driver here. Keeping the
    // method signature stable so the controller + Swagger surface don't move
    // between sprints.
    throw new NotImplementedException(
      'storage install orchestration lands in Sprint 2 (SeaweedFS driver)',
    );
  }

  async queueUninstall(_initiatedBy: string): Promise<{ installSessionId: string }> {
    throw new NotImplementedException(
      'storage uninstall orchestration lands in Sprint 4',
    );
  }
}
