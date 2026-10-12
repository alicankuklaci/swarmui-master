import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { StorageAuditService } from './audit.service';
import { NodeExecClient } from './node-exec.client';
import { StorageReconcilerService } from './reconciler.service';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import {
  SharedStorage,
  SharedStorageSchema,
} from './schemas/shared-storage.schema';
import {
  StorageAuditLog,
  StorageAuditLogSchema,
} from './schemas/storage-audit.schema';
import { DriverRegistry } from './drivers/driver.registry';
import { SeaweedfsDriver } from './drivers/seaweedfs/seaweedfs.driver';
import { NfsDriver } from './drivers/nfs/nfs.driver';

// Core module (Sprint 1). Install/uninstall orchestration lives in Sprint 2+;
// everything registered here is the stable infrastructure (schemas, audit,
// node-exec, driver registry, reconciler cron slot, HTTP surface).
//
// Feature flag: FEATURE_SHARED_STORAGE=true in env. When false (the default),
// AppModule skips importing this module entirely, so a disabled feature costs
// zero startup time and zero DB indexes.
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: SharedStorage.name, schema: SharedStorageSchema },
      { name: StorageAuditLog.name, schema: StorageAuditLogSchema },
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [StorageController],
  providers: [
    StorageAuditService,
    NodeExecClient,
    DriverRegistry,
    SeaweedfsDriver,
    NfsDriver,
    StorageReconcilerService,
    StorageService,
  ],
  exports: [
    StorageAuditService,
    NodeExecClient,
    DriverRegistry,
    StorageService,
  ],
})
export class StorageCoreModule implements OnModuleInit {
  private readonly logger = new Logger(StorageCoreModule.name);
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.logger.log(
      `shared-storage core loaded (feature flag ON) backends=seaweedfs,nfs mountPoint=${this.config.get<string>('STORAGE_MOUNT_POINT', '/var/lib/swarmui/shared')}`,
    );
  }
}

// Public helper so AppModule can gate the import on a config flag.
export function isSharedStorageEnabled(flag: string | undefined): boolean {
  return (flag ?? 'false').toLowerCase() === 'true';
}
