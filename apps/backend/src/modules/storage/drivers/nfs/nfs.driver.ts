import { Injectable } from '@nestjs/common';
import type {
  InstallPlan,
  SharedStorageConfig,
  StorageBackend,
} from '@swarmui-master/storage-plan';
import { ConsumerInspectorService } from '../../consumer-inspector.service';
import { HealthProbeResult, IStorageDriver } from '../driver.interface';

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

  // Sprint 5: health probe. The NFS driver's install path is still stubbed;
  // returning ok=true unconditionally would let an installed-but-not-really
  // doc stay HEALTHY forever. Return ok=false with a visible cause so an
  // operator who installed NFS by hand sees exactly why the reconciler
  // thinks it's degraded.
  async probeHealth(_config: SharedStorageConfig): Promise<HealthProbeResult> {
    return { ok: false, cause: 'NfsDriver.probeHealth not implemented (Sprint 6)' };
  }
}
