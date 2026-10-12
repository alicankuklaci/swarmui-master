import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  InstallPlan,
  InstallPlanStep,
  NodeExecCommandId,
  SharedStorageConfig,
  StorageBackend,
} from '@swarmui-master/storage-plan';
import { ConsumerInspectorService } from '../../consumer-inspector.service';
import { HealthProbeResult, IStorageDriver } from '../driver.interface';

// NFS driver (Sprint 6). Simple-mode topology:
//   - server  = config.nfsServerNode (must be in config.nodes). SPOF — v1
//               deliberately doesn't ship HA-NFS; a storage team moving
//               from NFS to SeaweedFS does so by re-installing with a
//               different backend, not by in-place conversion.
//   - clients = every other node in config.nodes. Each client mounts the
//               server's export at config.mountPoint and persists the mount
//               in /etc/fstab so a reboot comes back online.
//
// We follow the same step-id grammar as SeaweedFS (s{NN}-{verb}-{nodeId})
// so a UI that sorts lexicographically keeps steps in order.

const V1_MOUNT_POINT = '/var/lib/swarmui/shared';
const DEFAULT_ALLOWED_CLIENTS = '10.0.0.0/8'; // swarm overlay subnet
const EXPORT_OPTIONS = 'rw,sync,no_subtree_check,no_root_squash';
const MOUNT_OPTIONS = 'defaults,_netdev';
const SENTINEL = 'swarmui-nfs-shared';
const NFS_SERVER_UNIT = 'nfs-server.service';

@Injectable()
export class NfsDriver implements IStorageDriver {
  readonly backend: StorageBackend = 'nfs';

  constructor(private readonly consumerInspector: ConsumerInspectorService) {}

  plan(config: SharedStorageConfig, sessionId: string): InstallPlan {
    this.validate(config);
    const server = config.nfsServerNode as string;
    const clients = config.nodes.filter((n) => n !== server);
    const mountPoint = config.mountPoint ?? V1_MOUNT_POINT;
    // v1 hardcodes the client ACL to the swarm overlay subnet. A SwarmUI
    // operator wanting a tighter or looser ACL edits /etc/exports by hand;
    // the plan still owns teardown via the sentinel comment, so adding a
    // sibling export line out-of-band doesn't break uninstall.
    const allowedClients = DEFAULT_ALLOWED_CLIENTS;

    const steps: InstallPlanStep[] = [];
    let n = 0;
    const next = (): string => String(++n).padStart(2, '0');

    // 1. Server-side: install kernel server + make the mount root.
    steps.push({
      id: `s${next()}-mkdir-root-${server}`,
      description: `Create ${mountPoint} on ${server} (NFS server)`,
      nodeId: server,
      commandId: 'mkdir-swarmui-shared-root' satisfies NodeExecCommandId,
      args: { mountPoint, mode: '0775' },
    });
    steps.push({
      id: `s${next()}-apt-kernel-${server}`,
      description: `apt install nfs-kernel-server on ${server}`,
      nodeId: server,
      commandId: 'apt-install-nfs-kernel-server' satisfies NodeExecCommandId,
      args: {},
    });

    // 2. Clients: install nfs-common + make the mount root (will be
    //    the mountpoint after step 5).
    for (const node of clients) {
      steps.push({
        id: `s${next()}-mkdir-root-${node}`,
        description: `Create ${mountPoint} on ${node} (NFS client)`,
        nodeId: node,
        commandId: 'mkdir-swarmui-shared-root' satisfies NodeExecCommandId,
        args: { mountPoint, mode: '0775' },
      });
      steps.push({
        id: `s${next()}-apt-common-${node}`,
        description: `apt install nfs-common on ${node}`,
        nodeId: node,
        commandId: 'apt-install-nfs-common' satisfies NodeExecCommandId,
        args: {},
      });
    }

    // 3. Add the server-side export + reload exports table.
    steps.push({
      id: `s${next()}-export-add-${server}`,
      description: `Export ${mountPoint} to ${allowedClients}`,
      nodeId: server,
      commandId: 'nfs-export-add' satisfies NodeExecCommandId,
      args: {
        exportPath: mountPoint,
        clients: allowedClients,
        options: EXPORT_OPTIONS,
        sentinel: SENTINEL,
      },
    });

    // 4. Bring up the NFS server (enable + start).
    steps.push({
      id: `s${next()}-enable-server-${server}`,
      description: `systemctl enable --now ${NFS_SERVER_UNIT} on ${server}`,
      nodeId: server,
      commandId: 'systemctl-enable-nfs-server' satisfies NodeExecCommandId,
      args: {},
    });

    // 5. Clients: mount + fstab-add so the mount survives reboot.
    //    mount-nfs is idempotent (mountpoint -q pre-check in the handler).
    for (const node of clients) {
      steps.push({
        id: `s${next()}-mount-${node}`,
        description: `mount -t nfs ${server}:${mountPoint} ${mountPoint} on ${node}`,
        nodeId: node,
        commandId: 'mount-nfs' satisfies NodeExecCommandId,
        args: {
          server,
          remote: mountPoint,
          local: mountPoint,
          options: MOUNT_OPTIONS,
        },
      });
      steps.push({
        id: `s${next()}-fstab-add-${node}`,
        description: `fstab entry for ${server}:${mountPoint} on ${node}`,
        nodeId: node,
        commandId: 'fstab-add' satisfies NodeExecCommandId,
        args: {
          server,
          remote: mountPoint,
          local: mountPoint,
          options: MOUNT_OPTIONS,
          sentinel: SENTINEL,
        },
      });
    }

    // 6. Canary write — proves the exported path is actually writable
    //    end-to-end from the server's own view. If a client fails writes
    //    but this passes, the client's mount is suspect, not the export.
    steps.push({
      id: `s${next()}-test-write-${server}`,
      description: `Canary write to ${mountPoint} on ${server}`,
      nodeId: server,
      commandId: 'test-mount-write' satisfies NodeExecCommandId,
      args: { mountPoint },
    });

    return {
      backend: this.backend,
      sessionId,
      steps,
      mountPoint,
      driverOpts: {
        server,
        exportOptions: EXPORT_OPTIONS,
        mountOptions: MOUNT_OPTIONS,
        allowedClients,
      },
    };
  }

  uninstallPlan(config: SharedStorageConfig, sessionId: string): InstallPlan {
    this.validate(config);
    const server = config.nfsServerNode as string;
    const clients = config.nodes.filter((n) => n !== server);
    const mountPoint = config.mountPoint ?? V1_MOUNT_POINT;

    const steps: InstallPlanStep[] = [];
    let n = 0;
    const next = (): string => String(++n).padStart(2, '0');

    // 1. Clients first: pull the fstab entry (so a crash mid-uninstall
    //    doesn't come back mounted on reboot), then umount via mount-nfs
    //    with action=umount.
    for (const node of [...clients].reverse()) {
      steps.push({
        id: `s${next()}-fstab-remove-${node}`,
        description: `Remove ${server}:${mountPoint} fstab entry on ${node}`,
        nodeId: node,
        commandId: 'fstab-remove' satisfies NodeExecCommandId,
        args: { sentinel: SENTINEL },
        terminalOnFail: true,
      });
      steps.push({
        id: `s${next()}-umount-${node}`,
        description: `umount ${mountPoint} on ${node}`,
        nodeId: node,
        commandId: 'mount-nfs' satisfies NodeExecCommandId,
        args: { action: 'umount', local: mountPoint },
        terminalOnFail: true,
      });
    }

    // 2. Server: remove the export + disable the server.
    steps.push({
      id: `s${next()}-export-remove-${server}`,
      description: `Remove ${mountPoint} export on ${server}`,
      nodeId: server,
      commandId: 'nfs-export-remove' satisfies NodeExecCommandId,
      args: { sentinel: SENTINEL },
      terminalOnFail: true,
    });
    steps.push({
      id: `s${next()}-disable-server-${server}`,
      description: `systemctl disable --now ${NFS_SERVER_UNIT} on ${server}`,
      nodeId: server,
      commandId: 'systemctl-enable-nfs-server' satisfies NodeExecCommandId,
      args: { action: 'disable' },
      terminalOnFail: true,
    });

    return {
      backend: this.backend,
      sessionId,
      steps,
      mountPoint,
      driverOpts: { intent: 'uninstall', server },
    };
  }

  async enumerateConsumers(mountPoint: string): Promise<string[]> {
    return this.consumerInspector.enumerateConsumers(mountPoint);
  }

  // v1 probe: TCP-connect to the NFS server's 2049. Not great — doesn't
  // prove the export is still mounted on every client — but detects the
  // most common failure mode (server down / network split) without
  // round-tripping each client via node-exec. Sprint 7 can tighten this.
  async probeHealth(config: SharedStorageConfig): Promise<HealthProbeResult> {
    this.validate(config);
    const server = config.nfsServerNode as string;
    const net = await import('node:net');
    return new Promise<HealthProbeResult>((resolve) => {
      const socket = new net.Socket();
      const done = (res: HealthProbeResult) => {
        try {
          socket.destroy();
        } catch {
          /* already closed */
        }
        resolve(res);
      };
      socket.setTimeout(3_000, () =>
        done({ ok: false, cause: `TCP ${server}:2049 timeout` }),
      );
      socket.once('error', (err: Error) =>
        done({ ok: false, cause: `TCP ${server}:2049: ${err.message.slice(0, 160)}` }),
      );
      socket.connect(2049, server, () => done({ ok: true }));
    });
  }

  private validate(config: SharedStorageConfig): void {
    if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
      throw new BadRequestException('nfs plan requires at least one node');
    }
    if (new Set(config.nodes).size !== config.nodes.length) {
      throw new BadRequestException('nfs plan: duplicate node ids');
    }
    if (!config.nfsServerNode) {
      throw new BadRequestException(
        'nfs plan requires nfsServerNode (which node runs the export)',
      );
    }
    if (!config.nodes.includes(config.nfsServerNode)) {
      throw new BadRequestException(
        `nfs plan: nfsServerNode ${JSON.stringify(config.nfsServerNode)} is not in nodes [${config.nodes.join(', ')}]`,
      );
    }
  }
}
