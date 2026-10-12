import { NODE_EXEC_COMMANDS } from '@swarmui-master/storage-plan';
import { NOOP_HANDLER } from '../dispatcher';
import { mkdirSharedRootHandler, testMountWriteHandler } from './fs';
import { aptInstallHandler } from './apt';
import {
  dockerPullHandler,
  dockerRunFilerHandler,
  dockerRunMasterHandler,
  dockerRunVolumeHandler,
} from './docker';
import {
  installSeaweedfsMountSystemdUnitHandler,
  systemctlEnableHandler,
  tlsBootstrapNoopHandler,
} from './systemd';
import { firewallAllowPortsHandler } from './firewall';
import { seaweedfsHealthcheckHandler } from './healthcheck';
import {
  fstabAddHandler,
  fstabRemoveHandler,
  mountNfsHandler,
  nfsExportAddHandler,
  nfsExportRemoveHandler,
} from './nfs';
import { defaultExec, type Exec } from './exec';
import type { HandlerMap } from './types';

// The real handler map — composed opt-in by prod bootstrap. Tests that boot
// an agent for integration coverage keep using dispatcher's defaultHandlerMap()
// (all NOOP) so they don't need apt-get, docker, or a writable mount point.
//
// As each driver step gains a real handler across Sprint 3 D2+ (docker,
// systemd, firewall, NFS, healthcheck, TLS), swap its entry here. Commands
// not yet real stay on NOOP_HANDLER so an operator who flips to real-mode
// too early still gets a working, auditable "no-op success" rather than a
// hard 127.

export function realHandlerMap(exec: Exec = defaultExec): HandlerMap {
  const map: HandlerMap = {};
  for (const cmd of NODE_EXEC_COMMANDS) {
    map[cmd] = NOOP_HANDLER;
  }
  // D1 implemented
  map['mkdir-swarmui-shared-root'] = mkdirSharedRootHandler(exec);
  map['test-mount-write'] = testMountWriteHandler(exec);
  map['apt-install-fuse3'] = aptInstallHandler('fuse3', exec);
  map['apt-install-nfs-common'] = aptInstallHandler('nfs-common', exec);
  map['apt-install-nfs-kernel-server'] = aptInstallHandler('nfs-kernel-server', exec);
  // D2 implemented
  map['docker-pull-seaweedfs'] = dockerPullHandler(exec);
  map['docker-run-seaweedfs-master'] = dockerRunMasterHandler(exec);
  map['docker-run-seaweedfs-volume'] = dockerRunVolumeHandler(exec);
  map['docker-run-seaweedfs-filer'] = dockerRunFilerHandler(exec);
  // D3 implemented
  map['install-seaweedfs-mount-systemd-unit'] =
    installSeaweedfsMountSystemdUnitHandler(exec);
  map['systemctl-enable-seaweedfs-mount'] = systemctlEnableHandler(
    'seaweedfs-mount.service',
    exec,
  );
  map['systemctl-enable-nfs-server'] = systemctlEnableHandler(
    'nfs-server.service',
    exec,
  );
  map['firewall-allow-seaweedfs-ports'] = firewallAllowPortsHandler(exec);
  // TLS bootstrap: v1 insecure=true only. The handler is a documented no-op
  // until Sprint 7 wires a real cluster-CA — see tlsBootstrapNoopHandler.
  map['seaweedfs-tls-bootstrap'] = tlsBootstrapNoopHandler(exec);
  // D5 implemented
  map['seaweedfs-cluster-healthcheck'] = seaweedfsHealthcheckHandler(exec);
  // Sprint 6: NFS handlers. The NfsDriver plan now references these, so the
  // earlier NOOP placeholders would miscount against a real install.
  map['nfs-export-add'] = nfsExportAddHandler(exec);
  map['nfs-export-remove'] = nfsExportRemoveHandler(exec);
  map['mount-nfs'] = mountNfsHandler(exec);
  map['fstab-add'] = fstabAddHandler(exec);
  map['fstab-remove'] = fstabRemoveHandler(exec);
  return map;
}
