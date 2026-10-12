import { Injectable } from '@nestjs/common';
import type {
  InstallPlan,
  SharedStorageConfig,
  StorageBackend,
} from '@swarmui-master/storage-plan';
import { IStorageDriver } from '../driver.interface';

// Stub — the simple-mode NFS driver (Sprint 2) is the first real driver and
// will be implemented before SeaweedFS. For now, present the surface so the
// dispatcher can wire backend=nfs to a concrete provider.
@Injectable()
export class NfsDriver implements IStorageDriver {
  readonly backend: StorageBackend = 'nfs';

  plan(_config: SharedStorageConfig, _sessionId: string): InstallPlan {
    throw new Error('NfsDriver.plan not implemented (Sprint 2)');
  }

  uninstallPlan(_config: SharedStorageConfig, _sessionId: string): InstallPlan {
    throw new Error('NfsDriver.uninstallPlan not implemented (Sprint 2)');
  }

  async enumerateConsumers(_mountPoint: string): Promise<string[]> {
    return [];
  }
}
