import { Injectable } from '@nestjs/common';
import type {
  InstallPlan,
  SharedStorageConfig,
  StorageBackend,
} from '@swarmui-master/storage-plan';
import { IStorageDriver } from '../driver.interface';

// Stub — real plan generation lands in Sprint 3. The shape is here only to let
// storage-core compile against a concrete driver and to let the dispatcher
// find a provider for backend=seaweedfs.
@Injectable()
export class SeaweedfsDriver implements IStorageDriver {
  readonly backend: StorageBackend = 'seaweedfs';

  plan(_config: SharedStorageConfig, _sessionId: string): InstallPlan {
    throw new Error('SeaweedfsDriver.plan not implemented (Sprint 3)');
  }

  uninstallPlan(_config: SharedStorageConfig, _sessionId: string): InstallPlan {
    throw new Error('SeaweedfsDriver.uninstallPlan not implemented (Sprint 4)');
  }

  async enumerateConsumers(_mountPoint: string): Promise<string[]> {
    // Returning an empty list is safe for the Sprint 1 skeleton — Sprint 4
    // wires this up against the stacks/services inspector and refuses
    // uninstall when consumers exist.
    return [];
  }
}
