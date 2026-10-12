import * as crypto from 'node:crypto';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';
import { defaultExec, type Exec, type ExecOutcome } from './exec';
import type { CommandHandler } from './types';

// systemd handlers.
//
//   install-seaweedfs-mount-systemd-unit  → render unit file, daemon-reload
//   systemctl-enable-seaweedfs-mount      → enable --now (install) / disable --now (uninstall)
//   systemctl-enable-nfs-server           → same pattern, nfs-server.service
//
// We bind each handler to a fixed unit name at construction so a tampered
// request body can't swap out the service we're acting on; the only
// commandIds that reach this file are the whitelisted ones, each wired to
// its own factory in real-map.ts.

const UNIT_NAME_RE = /^[a-z0-9][a-z0-9._@-]{0,127}\.(service|mount|timer|socket)$/i;
const PATH_RE = /^\/[A-Za-z0-9._\-/]{1,255}$/;
const COLLECTION_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const FILER_URL_RE = /^[a-z0-9][a-z0-9._-]{0,254}:[0-9]{1,5}$/i;

const SYSTEMD_TIMEOUT_MS = 30_000;

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
    throw new Error(`systemd handler: invalid ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

// --- commandId: install-seaweedfs-mount-systemd-unit ------------------

// weed mount wraps the filer with FUSE. The unit intentionally runs
// after docker.service so the filer container is up before mount tries
// to connect; `Restart=on-failure` catches a cold start where the filer
// takes a moment to accept connections.
export const SEAWEEDFS_MOUNT_UNIT_PATH =
  '/etc/systemd/system/seaweedfs-mount.service';

export function renderSeaweedfsMountUnit(args: {
  filer: string;
  mountPoint: string;
  collection: string;
  tls: boolean;
}): string {
  const tlsFlag = args.tls ? ' -tls' : '';
  return [
    '[Unit]',
    'Description=SeaweedFS FUSE mount for SwarmUI shared storage',
    'Documentation=https://github.com/seaweedfs/seaweedfs',
    'After=docker.service network-online.target',
    'Requires=docker.service',
    '',
    '[Service]',
    'Type=simple',
    `ExecStartPre=/bin/mkdir -p ${args.mountPoint}`,
    `ExecStart=/usr/bin/docker exec seaweedfs-filer weed mount` +
      ` -filer=${args.filer}` +
      ` -dir=${args.mountPoint}` +
      ` -collection=${args.collection}` +
      tlsFlag,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
}

export function installSeaweedfsMountSystemdUnitHandler(
  exec: Exec = defaultExec,
): CommandHandler {
  return async (req) => {
    const filer = assertStringMatch(req.args.filer, FILER_URL_RE, 'filer');
    const mountPoint = assertStringMatch(
      req.args.mountPoint,
      PATH_RE,
      'mountPoint',
    );
    const collection = assertStringMatch(
      req.args.collection,
      COLLECTION_RE,
      'collection',
    );
    const tls = req.args.tls === true;
    const unit = renderSeaweedfsMountUnit({ filer, mountPoint, collection, tls });

    // Pipe the unit body to tee via stdin — avoids shelling out with the
    // unit text in argv (would show up in /proc/*/cmdline otherwise).
    const write = await exec(['tee', SEAWEEDFS_MOUNT_UNIT_PATH], {
      stdin: unit,
      timeoutMs: SYSTEMD_TIMEOUT_MS,
    });
    if (write.exitCode !== 0) return toResult(req, write);
    const reload = await exec(['systemctl', 'daemon-reload'], {
      timeoutMs: SYSTEMD_TIMEOUT_MS,
    });
    return toResult(req, reload);
  };
}

// --- commandId: systemctl-enable-<unit> ------------------------------

// install  → systemctl enable --now <unit>
// uninstall → systemctl disable --now <unit>  (args.action === 'disable')
//
// systemctl is already idempotent for both verbs; a second enable on an
// enabled unit returns 0 with "already enabled" on stderr. We re-run
// without a pre-check.
export function systemctlEnableHandler(
  unitName: string,
  exec: Exec = defaultExec,
): CommandHandler {
  const name = assertStringMatch(unitName, UNIT_NAME_RE, 'unitName');
  return async (req) => {
    const verb = req.args.action === 'disable' ? 'disable' : 'enable';
    const out = await exec(['systemctl', verb, '--now', name], {
      timeoutMs: SYSTEMD_TIMEOUT_MS,
    });
    return toResult(req, out);
  };
}

// --- commandId: seaweedfs-tls-bootstrap ------------------------------

// v1 ships `insecure=true` as the only supported path on Debian/Ubuntu swarm
// nodes behind a trusted overlay network. Sprint 7 wires a real cluster-CA
// bootstrap (gen key + cert on master, distribute via SSH to each node,
// register SPIFFE identity). Until then the handler is intentionally a
// no-op that writes a visible marker so an operator who runs with
// `insecure=false` sees exactly what happened and why.
export function tlsBootstrapNoopHandler(_exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const h = crypto
      .createHash('sha256')
      .update('tls-bootstrap-noop-v1')
      .digest('hex')
      .slice(0, 32);
    return {
      commandId: req.commandId,
      nodeId: req.nodeId,
      exitCode: 0,
      stdoutHash: h,
      stderrHash: h,
      stderrTail:
        'TLS bootstrap is a no-op in v1. Rerun install with insecure=true, ' +
        'or wait for Sprint 7 cluster-CA support.',
      durationMs: 0,
    };
  };
}
