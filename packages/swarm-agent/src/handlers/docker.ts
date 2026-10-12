import * as crypto from 'node:crypto';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';
import { defaultExec, type Exec, type ExecOutcome } from './exec';
import type { CommandHandler } from './types';

// Docker-level handlers. Each handler is a thin wrapper over `docker run` /
// `docker pull`, with two cross-cutting concerns handled here:
//
//   1. Idempotency. Install plans are rerun on resume; a `docker run` that
//      blows up because the container is already there would stall every
//      recovery. We check inspect() first and either skip (already running)
//      or `rm -f` and re-run (previously stopped, likely crashed).
//
//   2. Stop/remove via the same command id. Uninstall plans reuse the
//      install command id with `args.action = 'stop'` (see
//      seaweedfs.driver.uninstallPlan). The handler branches on action so
//      Sprint 4 teardown can share this path.
//
// All validation (image name, port range) belongs in the handler, not in
// the driver — a tampered plan body cannot smuggle shell characters past
// us by claiming a bogus image.

// Allow the usual registry/repository/digest surface, nothing exotic.
const IMAGE_RE = /^[a-z0-9][a-z0-9._\-/:@]{0,255}$/i;
const CONTAINER_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const PORT_RE = /^[0-9]{1,5}$/;
const REPLICATION_RE = /^[0-9]{3}$/;
const DC_RACK_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const MASTER_URL_RE = /^[a-z0-9][a-z0-9._-]{0,254}:[0-9]{1,5}$/i;

const DOCKER_PULL_TIMEOUT_MS = 10 * 60_000;
const DOCKER_RUN_TIMEOUT_MS = 60_000;
const DOCKER_INSPECT_TIMEOUT_MS = 10_000;

function toResult(req: NodeExecRequest, outcome: ExecOutcome): NodeExecResult {
  return {
    commandId: req.commandId,
    nodeId: req.nodeId,
    exitCode: outcome.exitCode,
    stdoutHash: outcome.stdoutHash,
    stderrHash: outcome.stderrHash,
    stdoutTail: outcome.stdoutTail,
    stderrTail: outcome.stderrTail,
    durationMs: outcome.durationMs,
  };
}

function assertStringMatch(value: unknown, re: RegExp, field: string): string {
  if (typeof value !== 'string' || !re.test(value)) {
    throw new Error(`docker handler: invalid ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

type ContainerState = 'absent' | 'running' | 'stopped';

// Inspect a container by name using a Go template so stdout is a single
// token we can compare without JSON parsing: "running" / "exited" / etc.,
// or the inspect call itself fails (absent) with exit 1.
async function inspectContainerState(
  exec: Exec,
  name: string,
): Promise<ContainerState> {
  const out = await exec(
    ['docker', 'inspect', '-f', '{{.State.Status}}', name],
    { timeoutMs: DOCKER_INSPECT_TIMEOUT_MS },
  );
  if (out.exitCode !== 0) return 'absent';
  const status = (out.stdoutTail ?? '').trim();
  return status === 'running' ? 'running' : 'stopped';
}

async function stopAndRemove(exec: Exec, name: string): Promise<ExecOutcome> {
  // `rm -f` on a running container stops+removes atomically — one fewer
  // round trip than stop + rm, and we don't care about graceful shutdown
  // for an uninstall.
  return exec(['docker', 'rm', '-f', name], { timeoutMs: DOCKER_RUN_TIMEOUT_MS });
}

// --- commandId: docker-pull-seaweedfs ----------------------------------

export function dockerPullHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const image = assertStringMatch(req.args.image, IMAGE_RE, 'image');
    const out = await exec(['docker', 'pull', image], {
      timeoutMs: DOCKER_PULL_TIMEOUT_MS,
    });
    return toResult(req, out);
  };
}

// --- commandId: docker-run-seaweedfs-master ----------------------------

const MASTER_NAME = 'seaweedfs-master';
const MASTER_DATA_DIR = '/var/lib/swarmui/data/master';

export function dockerRunMasterHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    if (req.args.action === 'stop') {
      return toResult(req, await stopAndRemove(exec, MASTER_NAME));
    }
    const image = assertStringMatch(req.args.image, IMAGE_RE, 'image');
    const port = assertStringMatch(String(req.args.port ?? '9333'), PORT_RE, 'port');
    const defaultReplication = assertStringMatch(
      String(req.args.defaultReplication ?? '010'),
      REPLICATION_RE,
      'defaultReplication',
    );

    const existing = await inspectContainerState(exec, MASTER_NAME);
    if (existing === 'running') {
      // Already up — idempotent success. Return a zero-exit outcome without
      // reaching for docker again.
      return toResult(req, idempotentOk());
    }
    if (existing === 'stopped') {
      const rm = await stopAndRemove(exec, MASTER_NAME);
      if (rm.exitCode !== 0) return toResult(req, rm);
    }

    const mk = await exec(['mkdir', '-p', MASTER_DATA_DIR], { timeoutMs: 5_000 });
    if (mk.exitCode !== 0) return toResult(req, mk);

    const argv = [
      'docker',
      'run',
      '-d',
      '--name',
      MASTER_NAME,
      '--restart',
      'unless-stopped',
      '--network',
      'host',
      '-v',
      `${MASTER_DATA_DIR}:/data`,
      image,
      'master',
      '-mdir=/data',
      `-port=${port}`,
      `-defaultReplication=${defaultReplication}`,
    ];
    return toResult(req, await exec(argv, { timeoutMs: DOCKER_RUN_TIMEOUT_MS }));
  };
}

// --- commandId: docker-run-seaweedfs-volume ----------------------------

const VOLUME_NAME = 'seaweedfs-volume';
const VOLUME_DATA_DIR = '/var/lib/swarmui/data/volume';

export function dockerRunVolumeHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    if (req.args.action === 'stop') {
      return toResult(req, await stopAndRemove(exec, VOLUME_NAME));
    }
    const image = assertStringMatch(req.args.image, IMAGE_RE, 'image');
    const port = assertStringMatch(String(req.args.port ?? '8080'), PORT_RE, 'port');
    const master = assertStringMatch(req.args.master, MASTER_URL_RE, 'master');
    const dataCenter = assertStringMatch(
      String(req.args.dataCenter ?? 'swarm'),
      DC_RACK_RE,
      'dataCenter',
    );
    const rack = assertStringMatch(req.args.rack, DC_RACK_RE, 'rack');

    const existing = await inspectContainerState(exec, VOLUME_NAME);
    if (existing === 'running') return toResult(req, idempotentOk());
    if (existing === 'stopped') {
      const rm = await stopAndRemove(exec, VOLUME_NAME);
      if (rm.exitCode !== 0) return toResult(req, rm);
    }

    const mk = await exec(['mkdir', '-p', VOLUME_DATA_DIR], { timeoutMs: 5_000 });
    if (mk.exitCode !== 0) return toResult(req, mk);

    const argv = [
      'docker',
      'run',
      '-d',
      '--name',
      VOLUME_NAME,
      '--restart',
      'unless-stopped',
      '--network',
      'host',
      '-v',
      `${VOLUME_DATA_DIR}:/data`,
      image,
      'volume',
      '-dir=/data',
      `-port=${port}`,
      `-mserver=${master}`,
      `-dataCenter=${dataCenter}`,
      `-rack=${rack}`,
    ];
    return toResult(req, await exec(argv, { timeoutMs: DOCKER_RUN_TIMEOUT_MS }));
  };
}

// --- commandId: docker-run-seaweedfs-filer -----------------------------

const FILER_NAME = 'seaweedfs-filer';

export function dockerRunFilerHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    if (req.args.action === 'stop') {
      return toResult(req, await stopAndRemove(exec, FILER_NAME));
    }
    const image = assertStringMatch(req.args.image, IMAGE_RE, 'image');
    const port = assertStringMatch(String(req.args.port ?? '8888'), PORT_RE, 'port');
    const grpcPort = assertStringMatch(
      String(req.args.grpcPort ?? '18888'),
      PORT_RE,
      'grpcPort',
    );
    const master = assertStringMatch(req.args.master, MASTER_URL_RE, 'master');

    const existing = await inspectContainerState(exec, FILER_NAME);
    if (existing === 'running') return toResult(req, idempotentOk());
    if (existing === 'stopped') {
      const rm = await stopAndRemove(exec, FILER_NAME);
      if (rm.exitCode !== 0) return toResult(req, rm);
    }

    const argv = [
      'docker',
      'run',
      '-d',
      '--name',
      FILER_NAME,
      '--restart',
      'unless-stopped',
      '--network',
      'host',
      image,
      'filer',
      `-master=${master}`,
      `-port=${port}`,
      `-port.grpc=${grpcPort}`,
    ];
    return toResult(req, await exec(argv, { timeoutMs: DOCKER_RUN_TIMEOUT_MS }));
  };
}

// A synthetic "already converged" result: the handler decided no work was
// needed, hashed over the sentinel string. Operators who read the audit
// log can spot an idempotent-skip by this specific stderrTail — it never
// collides with a real docker stderr.
function idempotentOk(): ExecOutcome {
  const h = crypto
    .createHash('sha256')
    .update('idempotent-skip')
    .digest('hex')
    .slice(0, 32);
  return {
    exitCode: 0,
    stdoutHash: h,
    stderrHash: h,
    stderrTail: 'idempotent-skip: container already running',
    durationMs: 0,
  };
}

// Also expose names + inspect for the real-map wiring and any future tests
// that want to exercise the idempotency logic without going through a
// commandId.
export const SEAWEEDFS_CONTAINER_NAMES = {
  master: MASTER_NAME,
  volume: VOLUME_NAME,
  filer: FILER_NAME,
} as const;

export { CONTAINER_NAME_RE, inspectContainerState, stopAndRemove };
