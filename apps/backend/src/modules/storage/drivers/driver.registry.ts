import { Injectable, NotFoundException } from '@nestjs/common';
import type { StorageBackend } from '@swarmui-master/storage-plan';
import { IStorageDriver } from './driver.interface';
import { SeaweedfsDriver } from './seaweedfs/seaweedfs.driver';
import { NfsDriver } from './nfs/nfs.driver';

// Resolves a driver by backend. Kept as a Nest-managed provider so test doubles
// can replace individual drivers via DI (`useClass` / `useValue`) without
// touching the registry.
@Injectable()
export class DriverRegistry {
  constructor(
    private readonly seaweedfs: SeaweedfsDriver,
    private readonly nfs: NfsDriver,
  ) {}

  get(backend: StorageBackend): IStorageDriver {
    switch (backend) {
      case 'seaweedfs':
        return this.seaweedfs;
      case 'nfs':
        return this.nfs;
      default: {
        const exhaustive: never = backend;
        throw new NotFoundException(`No driver for backend: ${exhaustive as string}`);
      }
    }
  }
}
