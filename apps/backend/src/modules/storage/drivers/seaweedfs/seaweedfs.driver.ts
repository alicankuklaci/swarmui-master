import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  InstallPlan,
  InstallPlanStep,
  NodeExecCommandId,
  SharedStorageConfig,
  StorageBackend,
} from '@swarmui-master/storage-plan';
import { ConsumerInspectorService } from '../../consumer-inspector.service';
import { HealthProbeResult, IStorageDriver } from '../driver.interface';

// SeaweedFS driver — Sprint 2.
//
// Topology (v1, simplest shape that still gives redundancy):
//   - master  = nodes[0]              (coordinator; single master for v1,
//                                      HA-master is a Sprint 7 follow-up)
//   - filer   = nodes[0]              (metadata; co-located with master)
//   - volumes = nodes[0..n-1]         (data; every node gets a volume server)
//   - mounts  = nodes[0..n-1]         (every node exposes /var/lib/swarmui/shared
//                                      so stacks can bind-mount regardless of
//                                      which node schedules the task)
//
// Steps are *data*, not shell. Each step maps 1:1 to a NodeExecCommandId in the
// agent whitelist (packages/storage-plan/command.types.ts). The agent re-reads
// the whitelist from that package, so adding a new commandId here without a
// matching agent handler is a validation error at install time — never a shell
// surprise on the node.
//
// Step id convention:
//   s{NN}-{short-verb}-{nodeId}
// NN keeps steps in order when a UI sorts lexicographically; the (verb, nodeId)
// tail makes the id unique and lets the operator find a specific failed step
// in the audit log without scanning descriptions.

const SW_MASTER_PORT = 9333;
const SW_VOLUME_PORT = 8080;
const SW_FILER_PORT = 8888;
const SW_FILER_GRPC_PORT = 18888;
const DEFAULT_REPLICATION = '010';
const V1_MOUNT_POINT = '/var/lib/swarmui/shared';
const SW_IMAGE = 'chrislusf/seaweedfs:3.80';

// Probe runs backend-side on the swarm manager. These URLs are reached
// directly, not through node-exec — a per-minute HMAC round-trip to the
// agent would double the cost of healthchecks on an otherwise idle cluster.
// The HTTP endpoints match the ones the install-time seaweedfs-cluster-
// healthcheck step verifies (packages/swarm-agent/src/handlers/healthcheck.ts).
const PROBE_TIMEOUT_MS = 5_000;

@Injectable()
export class SeaweedfsDriver implements IStorageDriver {
  readonly backend: StorageBackend = 'seaweedfs';
  private readonly logger = new Logger(SeaweedfsDriver.name);
  // Overridable in tests. We don't inject fetch via Nest DI because fetch is
  // a global in Node 18+ and swapping it in tests via driver.fetch = fn is
  // less ceremony than wrapping it in a provider.
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);

  constructor(private readonly consumerInspector: ConsumerInspectorService) {}

  plan(config: SharedStorageConfig, sessionId: string): InstallPlan {
    this.validate(config);
    const nodes = config.nodes;
    const master = nodes[0];
    const replication = config.replication ?? DEFAULT_REPLICATION;
    const mountPoint = config.mountPoint ?? V1_MOUNT_POINT;
    const insecure = config.insecure === true;

    const steps: InstallPlanStep[] = [];
    let n = 0;
    const next = (): string => String(++n).padStart(2, '0');

    // 1. TLS bootstrap (once, on master). Skipped only when the operator
    //    explicitly opts out — a trusted-network/dev shortcut.
    if (!insecure) {
      steps.push({
        id: `s${next()}-tls-bootstrap-${master}`,
        description: 'Generate SeaweedFS cluster CA and distribute node certs',
        nodeId: master,
        commandId: 'seaweedfs-tls-bootstrap' satisfies NodeExecCommandId,
        args: {
          commonName: 'swarmui-seaweedfs',
          nodes: nodes.join(','),
        },
      });
    }

    // 2. Per-node bootstrap: mkdir mount root, install fuse3 (needed for
    //    `weed mount`), pull the image. Order matters only within a node;
    //    different nodes are independent and could run in parallel in a
    //    future orchestrator — for v1 we serialize for easier audit.
    for (const node of nodes) {
      steps.push({
        id: `s${next()}-mkdir-root-${node}`,
        description: `Create ${mountPoint} on ${node}`,
        nodeId: node,
        commandId: 'mkdir-swarmui-shared-root' satisfies NodeExecCommandId,
        args: { path: mountPoint, mode: '0750' },
      });
      steps.push({
        id: `s${next()}-apt-fuse3-${node}`,
        description: `apt install fuse3 on ${node}`,
        nodeId: node,
        commandId: 'apt-install-fuse3' satisfies NodeExecCommandId,
        args: {},
      });
      steps.push({
        id: `s${next()}-pull-image-${node}`,
        description: `docker pull ${SW_IMAGE} on ${node}`,
        nodeId: node,
        commandId: 'docker-pull-seaweedfs' satisfies NodeExecCommandId,
        args: { image: SW_IMAGE },
      });
    }

    // 3. Master (nodes[0]).
    steps.push({
      id: `s${next()}-run-master-${master}`,
      description: `docker run seaweedfs master on ${master}:${SW_MASTER_PORT}`,
      nodeId: master,
      commandId: 'docker-run-seaweedfs-master' satisfies NodeExecCommandId,
      args: {
        image: SW_IMAGE,
        port: SW_MASTER_PORT,
        defaultReplication: replication,
        // C pack #10: don't pass `tls` here — the docker-run handlers
        // don't consume it, so including it in the audit trail suggests
        // a wiring that doesn't exist. The TLS flags on the actual
        // weed-master/volume/filer processes are a Sprint 8 follow-up
        // (needs cert volume mounts + container flag plumbing). The
        // `seaweedfs-tls-bootstrap` step above is the real signal.
      },
    });

    // 4. Volume server on every node, pointing at the master.
    for (const node of nodes) {
      steps.push({
        id: `s${next()}-run-volume-${node}`,
        description: `docker run seaweedfs volume on ${node}:${SW_VOLUME_PORT}`,
        nodeId: node,
        commandId: 'docker-run-seaweedfs-volume' satisfies NodeExecCommandId,
        args: {
          image: SW_IMAGE,
          port: SW_VOLUME_PORT,
          master: `${master}:${SW_MASTER_PORT}`,
          dataCenter: 'swarm',
          rack: node, // one rack per node → replication=010 means "another node"
        },
      });
    }

    // 5. Filer (nodes[0]).
    steps.push({
      id: `s${next()}-run-filer-${master}`,
      description: `docker run seaweedfs filer on ${master}:${SW_FILER_PORT}`,
      nodeId: master,
      commandId: 'docker-run-seaweedfs-filer' satisfies NodeExecCommandId,
      args: {
        image: SW_IMAGE,
        port: SW_FILER_PORT,
        grpcPort: SW_FILER_GRPC_PORT,
        master: `${master}:${SW_MASTER_PORT}`,
      },
    });

    // 6. Firewall opens — overlay network only, never 0.0.0.0.
    for (const node of nodes) {
      steps.push({
        id: `s${next()}-firewall-${node}`,
        description: `Open SeaweedFS ports on ${node} (overlay-net scope)`,
        nodeId: node,
        commandId: 'firewall-allow-seaweedfs-ports' satisfies NodeExecCommandId,
        args: {
          ports: `${SW_MASTER_PORT},${SW_VOLUME_PORT},${SW_FILER_PORT},${SW_FILER_GRPC_PORT}`,
          scope: 'overlay',
        },
      });
    }

    // 7. Per-node mount unit + enable. systemd unit depends on the filer; it
    //    will come up as soon as the filer answers.
    for (const node of nodes) {
      steps.push({
        id: `s${next()}-mount-unit-${node}`,
        description: `Install systemd unit for weed mount on ${node}`,
        nodeId: node,
        commandId: 'install-seaweedfs-mount-systemd-unit' satisfies NodeExecCommandId,
        args: {
          filer: `${master}:${SW_FILER_PORT}`,
          mountPoint,
          collection: 'swarmui',
          tls: !insecure,
        },
      });
      steps.push({
        id: `s${next()}-enable-mount-${node}`,
        description: `systemctl enable --now seaweedfs-mount on ${node}`,
        nodeId: node,
        commandId: 'systemctl-enable-seaweedfs-mount' satisfies NodeExecCommandId,
        args: {},
      });
    }

    // 8. Cluster-level sanity: master+filer+all volumes alive and known to the
    //    cluster. Fatal if red — we won't flip to HEALTHY while anything is
    //    missing because stacks would bind-mount a half-cluster.
    steps.push({
      id: `s${next()}-cluster-healthcheck-${master}`,
      description: 'Verify SeaweedFS cluster is healthy end-to-end',
      nodeId: master,
      commandId: 'seaweedfs-cluster-healthcheck' satisfies NodeExecCommandId,
      args: {
        master: `${master}:${SW_MASTER_PORT}`,
        filer: `${master}:${SW_FILER_PORT}`,
        expectedVolumeServers: nodes.length,
      },
    });

    // 9. Canary write — proves the mount actually accepts writes end-to-end
    //    on the master's local mount. If this fails after the healthcheck
    //    passes, the mount client is the problem (fuse3, perms), not the
    //    cluster.
    steps.push({
      id: `s${next()}-test-write-${master}`,
      description: `Canary write to ${mountPoint} on ${master}`,
      nodeId: master,
      commandId: 'test-mount-write' satisfies NodeExecCommandId,
      args: { path: mountPoint },
    });

    return {
      backend: this.backend,
      sessionId,
      steps,
      mountPoint,
      driverOpts: {
        replication,
        master: `${master}:${SW_MASTER_PORT}`,
        filer: `${master}:${SW_FILER_PORT}`,
        image: SW_IMAGE,
        insecure,
      },
    };
  }

  uninstallPlan(config: SharedStorageConfig, sessionId: string): InstallPlan {
    this.validate(config);
    const nodes = config.nodes;
    const master = nodes[0];
    const mountPoint = config.mountPoint ?? V1_MOUNT_POINT;

    const steps: InstallPlanStep[] = [];
    let n = 0;
    const next = (): string => String(++n).padStart(2, '0');

    // Uninstall is the reverse walk, roughly. v2 ships the full teardown
    // (stop containers, remove systemd units, revoke firewall rules). Sprint 4
    // owns the destructive teardown; for Sprint 2 we only need the shape so
    // enumerateConsumers can refuse the delete when the plan would be destructive.
    // Order: unmount → stop containers → remove systemd unit → revoke firewall.

    // Reverse of the install mount steps.
    for (const node of [...nodes].reverse()) {
      // The agent handler disables the systemd unit, stops the mount, and
      // umounts the fuse mount at /var/lib/swarmui/shared.
      steps.push({
        id: `s${next()}-stop-mount-${node}`,
        description: `systemctl disable --now seaweedfs-mount on ${node}`,
        nodeId: node,
        commandId: 'systemctl-enable-seaweedfs-mount' satisfies NodeExecCommandId,
        args: { action: 'disable' },
        terminalOnFail: true,
      });
    }

    // Stop volume servers.
    for (const node of [...nodes].reverse()) {
      steps.push({
        id: `s${next()}-stop-volume-${node}`,
        description: `Stop seaweedfs volume container on ${node}`,
        nodeId: node,
        commandId: 'docker-run-seaweedfs-volume' satisfies NodeExecCommandId,
        args: { action: 'stop' },
        terminalOnFail: true,
      });
    }

    // Stop filer + master.
    steps.push({
      id: `s${next()}-stop-filer-${master}`,
      description: `Stop seaweedfs filer container on ${master}`,
      nodeId: master,
      commandId: 'docker-run-seaweedfs-filer' satisfies NodeExecCommandId,
      args: { action: 'stop' },
      terminalOnFail: true,
    });
    steps.push({
      id: `s${next()}-stop-master-${master}`,
      description: `Stop seaweedfs master container on ${master}`,
      nodeId: master,
      commandId: 'docker-run-seaweedfs-master' satisfies NodeExecCommandId,
      args: { action: 'stop' },
      terminalOnFail: true,
    });

    // Revoke firewall rules.
    for (const node of [...nodes].reverse()) {
      steps.push({
        id: `s${next()}-firewall-close-${node}`,
        description: `Revoke SeaweedFS firewall rules on ${node}`,
        nodeId: node,
        commandId: 'firewall-allow-seaweedfs-ports' satisfies NodeExecCommandId,
        args: {
          ports: `${SW_MASTER_PORT},${SW_VOLUME_PORT},${SW_FILER_PORT},${SW_FILER_GRPC_PORT}`,
          action: 'revoke',
        },
        terminalOnFail: true,
      });
    }

    return {
      backend: this.backend,
      sessionId,
      steps,
      mountPoint,
      driverOpts: { intent: 'uninstall' },
    };
  }

  async enumerateConsumers(mountPoint: string): Promise<string[]> {
    // Sprint 4: delegate to the shared inspector. The service enumerates
    // swarm services whose spec bind-mounts the shared mount, so the delete
    // path can refuse an uninstall while anyone is still using the storage.
    return this.consumerInspector.enumerateConsumers(mountPoint);
  }

  // Sprint 5: HTTP probe against the running cluster. Three checks, same
  // shape as the install-time healthcheck: master `/cluster/status`,
  // master `/vol/status` with volume server count, filer `/`.
  //
  // The config carries `nodes` so we know the expected volume-server count
  // (one per node for v1) and `insecure` so we pick http vs https. Any
  // single-probe failure sets ok=false — the reconciler's state machine
  // decides whether that's a transient blip or a real DEGRADED.
  async probeHealth(config: SharedStorageConfig): Promise<HealthProbeResult> {
    this.validate(config);
    const master = config.nodes[0];
    const scheme = config.insecure === true ? 'http' : 'https';
    const masterUrl = `${scheme}://${master}:${SW_MASTER_PORT}`;
    const filerUrl = `${scheme}://${master}:${SW_FILER_PORT}`;
    const expectedVolumes = config.nodes.length;

    // 1. Master /cluster/status reachable.
    const cluster = await this.probe(`${masterUrl}/cluster/status`);
    if (!cluster.ok) {
      return { ok: false, cause: `master unreachable: ${cluster.cause}` };
    }

    // 2. Master /vol/status: parse JSON, count distinct volume servers.
    //    SeaweedFS has returned several shapes historically — we count
    //    occurrences of `"PublicUrl"` in the response body, matching the
    //    install-time grep check. If the body couldn't be read we fail
    //    cleanly instead of asserting a specific JSON schema.
    const vol = await this.probeText(`${masterUrl}/vol/status`);
    if (!vol.ok || vol.body === undefined) {
      return { ok: false, cause: `master /vol/status: ${vol.cause}` };
    }
    const found = (vol.body.match(/"PublicUrl"/g) ?? []).length;
    if (found < expectedVolumes) {
      return {
        ok: false,
        cause: `expected ${expectedVolumes} volume servers, found ${found}`,
      };
    }

    // 3. Filer reachable.
    const filer = await this.probe(`${filerUrl}/`);
    if (!filer.ok) {
      return { ok: false, cause: `filer unreachable: ${filer.cause}` };
    }

    return { ok: true };
  }

  private async probe(
    url: string,
  ): Promise<{ ok: boolean; cause?: string }> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      try {
        const res = await this.fetchImpl(url, { signal: ctrl.signal });
        if (!res.ok) {
          return { ok: false, cause: `HTTP ${res.status}` };
        }
        return { ok: true };
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      const msg = (err as Error).message || 'fetch failed';
      return { ok: false, cause: msg.slice(0, 200) };
    }
  }

  private async probeText(
    url: string,
  ): Promise<{ ok: boolean; cause?: string; body?: string }> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      try {
        const res = await this.fetchImpl(url, { signal: ctrl.signal });
        if (!res.ok) {
          return { ok: false, cause: `HTTP ${res.status}` };
        }
        const body = await res.text();
        return { ok: true, body };
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      const msg = (err as Error).message || 'fetch failed';
      return { ok: false, cause: msg.slice(0, 200) };
    }
  }

  private validate(config: SharedStorageConfig): void {
    if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
      throw new BadRequestException('seaweedfs plan requires at least one node');
    }
    if (new Set(config.nodes).size !== config.nodes.length) {
      throw new BadRequestException('seaweedfs plan: duplicate node ids');
    }
    if (
      config.replication !== undefined &&
      !/^[0-9]{3}$/.test(config.replication)
    ) {
      throw new BadRequestException(
        `seaweedfs plan: replication must be a 3-digit string, got "${config.replication}"`,
      );
    }
    const r = config.replication ?? DEFAULT_REPLICATION;
    // Volume count required by replication = sum(digits) + 1. We only need
    // enough volume servers for the chosen replication; otherwise cluster
    // health will never go green and we'd time out at the healthcheck step.
    const requiredVolumes =
      r.split('').reduce((acc, c) => acc + Number(c), 0) + 1;
    if (config.nodes.length < requiredVolumes) {
      throw new BadRequestException(
        `seaweedfs plan: replication=${r} needs ≥ ${requiredVolumes} nodes; have ${config.nodes.length}`,
      );
    }
  }
}
