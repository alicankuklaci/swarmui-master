import * as crypto from 'node:crypto';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';
import { defaultExec, type Exec, type ExecOutcome } from './exec';
import type { CommandHandler } from './types';

// NFS handlers (Sprint 6 D2) — consumer side of the NfsDriver plan.
//
//   nfs-export-add    → append sentinel-tagged line to /etc/exports; exportfs -ra
//   nfs-export-remove → sed delete by sentinel; exportfs -ra
//   mount-nfs         → mount after mountpoint -q (idempotent); action=umount
//                       for the uninstall path
//   fstab-add         → append sentinel-tagged line to /etc/fstab (grep-skip
//                       when already present)
//   fstab-remove      → sed delete by sentinel
//
// Every persistent-file line carries a sentinel suffix comment like
// `# swarmui-nfs-shared` so removal is deterministic: we never touch a
// line we did not write ourselves, which keeps a hand-maintained
// /etc/exports or /etc/fstab safe from the agent's teardown pass.

const PATH_RE = /^\/[A-Za-z0-9._\-/]{1,255}$/;
const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/;
// NFS clients: wildcard, hostname, CIDR, or an `@netgroup`. The surface is
// deliberately narrow — exotic configurations get a code review, not a
// permissive regex.
const CLIENT_RE = /^[a-zA-Z0-9*@][a-zA-Z0-9.*/_-]{0,127}$/;
const OPTS_RE = /^[a-zA-Z0-9_=,.:+-]{1,255}$/;
const SENTINEL_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const DEFAULT_SENTINEL = 'swarmui-nfs-shared';
const DEFAULT_EXPORT_OPTIONS = 'rw,sync,no_subtree_check,no_root_squash';
const DEFAULT_MOUNT_OPTIONS = 'defaults,_netdev';

const NFS_TIMEOUT_MS = 30_000;
const MOUNT_TIMEOUT_MS = 60_000;

const EXPORTS_FILE = '/etc/exports';
const FSTAB_FILE = '/etc/fstab';

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
    throw new Error(`nfs handler: invalid ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

function sentinelOf(req: NodeExecRequest): string {
  const raw = req.args.sentinel;
  if (raw === undefined) return DEFAULT_SENTINEL;
  return assertStringMatch(raw, SENTINEL_RE, 'sentinel');
}

// Synthetic "nothing to do" outcome. Keeps the audit log auditable without a
// shelled-out no-op.
function syntheticOk(label: string): ExecOutcome {
  const h = crypto.createHash('sha256').update(label).digest('hex').slice(0, 32);
  return {
    exitCode: 0,
    stdoutHash: h,
    stderrHash: h,
    stderrTail: label,
    durationMs: 0,
  };
}

// Shared "append line with sentinel tag unless already present" pattern.
async function appendTaggedLine(
  exec: Exec,
  file: string,
  line: string,
  sentinel: string,
): Promise<ExecOutcome> {
  const needle = `# ${sentinel}`;
  // grep -qF: fixed-string, quiet. Exit 0 → present → skip; 1 → absent →
  // append; 2 → file missing (tee -a will create it); anything else → surface.
  const check = await exec(['grep', '-qF', needle, file], {
    timeoutMs: NFS_TIMEOUT_MS,
  });
  if (check.exitCode === 0) {
    return syntheticOk(`idempotent-skip: ${file} already has ${sentinel}`);
  }
  if (check.exitCode !== 1 && check.exitCode !== 2) {
    return check;
  }
  return exec(['tee', '-a', file], {
    stdin: `${line} ${needle}\n`,
    timeoutMs: NFS_TIMEOUT_MS,
  });
}

// Shared "delete lines by sentinel tag" pattern. sed -i anchors the regex
// at EOL so lines we didn't write stay put.
async function deleteTaggedLines(
  exec: Exec,
  file: string,
  sentinel: string,
): Promise<ExecOutcome> {
  // Belt-and-braces: our regex guarantees [a-z0-9_-] already, but strip
  // anything stray so no sed meta-char leaks in from a future caller.
  const safe = sentinel.replace(/[^a-z0-9_-]/gi, '');
  return exec(['sed', '-i', `/# ${safe}$/d`, file], {
    timeoutMs: NFS_TIMEOUT_MS,
  });
}

// --- commandId: nfs-export-add --------------------------------------

export function nfsExportAddHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const exportPath = assertStringMatch(req.args.exportPath, PATH_RE, 'exportPath');
    const clients = assertStringMatch(req.args.clients, CLIENT_RE, 'clients');
    const opts =
      typeof req.args.options === 'string'
        ? assertStringMatch(req.args.options, OPTS_RE, 'options')
        : DEFAULT_EXPORT_OPTIONS;
    const sentinel = sentinelOf(req);
    // /etc/exports line format: <path> <clients>(<options>)
    const line = `${exportPath} ${clients}(${opts})`;

    const appended = await appendTaggedLine(exec, EXPORTS_FILE, line, sentinel);
    if (appended.exitCode !== 0) return toResult(req, appended);
    const reload = await exec(['exportfs', '-ra'], { timeoutMs: NFS_TIMEOUT_MS });
    return toResult(req, reload);
  };
}

// --- commandId: nfs-export-remove -----------------------------------

export function nfsExportRemoveHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const sentinel = sentinelOf(req);
    const del = await deleteTaggedLines(exec, EXPORTS_FILE, sentinel);
    if (del.exitCode !== 0) return toResult(req, del);
    const reload = await exec(['exportfs', '-ra'], { timeoutMs: NFS_TIMEOUT_MS });
    return toResult(req, reload);
  };
}

// --- commandId: mount-nfs -------------------------------------------

export function mountNfsHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    // Uninstall path: args.action='umount' + local only. We don't force
    // (`-f`/`-l` lazy) in v1 — a stuck umount is a signal, not something to
    // paper over. Operator fixes the host, retries.
    if (req.args.action === 'umount') {
      const local = assertStringMatch(req.args.local, PATH_RE, 'local');
      // Already not a mount point? Treat as success — same shape as the
      // mount idempotency check.
      const mounted = await exec(['mountpoint', '-q', local], {
        timeoutMs: NFS_TIMEOUT_MS,
      });
      if (mounted.exitCode !== 0) {
        return toResult(req, syntheticOk(`idempotent-skip: ${local} not mounted`));
      }
      return toResult(
        req,
        await exec(['umount', local], { timeoutMs: MOUNT_TIMEOUT_MS }),
      );
    }

    const server = assertStringMatch(req.args.server, HOST_RE, 'server');
    const remote = assertStringMatch(req.args.remote, PATH_RE, 'remote');
    const local = assertStringMatch(req.args.local, PATH_RE, 'local');
    const opts =
      typeof req.args.options === 'string'
        ? assertStringMatch(req.args.options, OPTS_RE, 'options')
        : DEFAULT_MOUNT_OPTIONS;

    // mountpoint -q: exit 0 → already a mountpoint, skip the mount.
    const already = await exec(['mountpoint', '-q', local], {
      timeoutMs: NFS_TIMEOUT_MS,
    });
    if (already.exitCode === 0) {
      return toResult(req, syntheticOk(`idempotent-skip: ${local} already mounted`));
    }

    // Make sure the mount target exists.
    const mk = await exec(['mkdir', '-p', local], { timeoutMs: NFS_TIMEOUT_MS });
    if (mk.exitCode !== 0) return toResult(req, mk);

    return toResult(
      req,
      await exec(
        ['mount', '-t', 'nfs', '-o', opts, `${server}:${remote}`, local],
        { timeoutMs: MOUNT_TIMEOUT_MS },
      ),
    );
  };
}

// --- commandId: fstab-add -------------------------------------------

export function fstabAddHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const server = assertStringMatch(req.args.server, HOST_RE, 'server');
    const remote = assertStringMatch(req.args.remote, PATH_RE, 'remote');
    const local = assertStringMatch(req.args.local, PATH_RE, 'local');
    const opts =
      typeof req.args.options === 'string'
        ? assertStringMatch(req.args.options, OPTS_RE, 'options')
        : DEFAULT_MOUNT_OPTIONS;
    const sentinel = sentinelOf(req);

    // /etc/fstab columns: fsSpec mountPoint type opts dump pass
    const line = `${server}:${remote} ${local} nfs ${opts} 0 0`;
    return toResult(req, await appendTaggedLine(exec, FSTAB_FILE, line, sentinel));
  };
}

// --- commandId: fstab-remove ----------------------------------------

export function fstabRemoveHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const sentinel = sentinelOf(req);
    return toResult(req, await deleteTaggedLines(exec, FSTAB_FILE, sentinel));
  };
}

export const NFS_SENTINEL_DEFAULT = DEFAULT_SENTINEL;
export const NFS_EXPORTS_FILE = EXPORTS_FILE;
export const NFS_FSTAB_FILE = FSTAB_FILE;
