import { Injectable } from '@nestjs/common';
import type {
  InstallPlan,
  SharedStorageConfig,
  StorageBackend,
} from '@swarmui-master/storage-plan';
import { ConsumerInspectorService } from '../../consumer-inspector.service';
import { IStorageDriver } from '../driver.interface';

// Stub — the simple-mode NFS driver (Sprint 2) is the first real driver and
// will be implemented before SeaweedFS. For now, present the surface so the
// dispatcher can wire backend=nfs to a concrete provider.
@Injectable()
export class NfsDriver implements IStorageDriver {
  readonly backend: StorageBackend = 'nfs';

  constructor(private readonly consumerInspector: ConsumerInspectorService) {}

  plan(_config: SharedStorageConfig, _sessionId: string): InstallPlan {
    throw new Error('NfsDriver.plan not implemented (Sprint 2)');
  }

  uninstallPlan(_config: SharedStorageConfig, _sessionId: string): InstallPlan {
    throw new Error('NfsDriver.uninstallPlan not implemented (Sprint 2)');
  }

  // Sprint 4: same inspector as the SeaweedFS driver — "which services
  // bind-mount the shared path" is backend-independent.
  async enumerateConsumers(mountPoint: string): Promise<string[]> {
    return this.consumerInspector.enumerateConsumers(mountPoint);
  }
}
