import * as crypto from 'node:crypto';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';
import { defaultExec, type Exec } from './exec';
import type { CommandHandler } from './types';

// Filesystem-level handlers. Each one is a thin shell over exec(): the real
// work is a single argv. Keeping the body short makes the handler obvious
// at a glance — the only non-obvious bits (hashing, timeout, tail) all live
// in exec.ts.

const DEFAULT_MOUNT = '/var/lib/swarmui/shared';
const MKDIR_MODE = '0775';
const CANARY_TTL_SECONDS = 5;

// Match the systemd/nfs handlers: an absolute POSIX path, letters + digits
// + `._-/`, 1-255 chars, with no `..` or `.` traversal segments. Previously
// `fs.ts` cast req.args.mountPoint straight to string — the backend's own
// plan always sends `/var/lib/swarmui/shared`, but an operator or future
// endpoint that forwards user input would otherwise be able to inject
// `../../etc` and have the agent happily `mkdir -p` or `cat` there.
const PATH_RE = /^\/[A-Za-z0-9._\-/]{1,255}$/;
const MODE_RE = /^[0-7]{3,4}$/;
function assertPath(value: unknown, field: string): string {
  if (typeof value !== 'string' || !PATH_RE.test(value)) {
    throw new Error(`fs handler: invalid ${field}: ${JSON.stringify(value)}`);
  }
  for (const seg of value.split('/')) {
    if (seg === '..' || seg === '.') {
      throw new Error(`fs handler: path traversal segment in ${field}: ${JSON.stringify(value)}`);
    }
  }
  return value;
}
function assertMode(value: unknown, field: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !MODE_RE.test(value)) {
    throw new Error(`fs handler: invalid ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

function toResult(
  req: NodeExecRequest,
  outcome: {
    exitCode: number;
    stdoutHash: string;
    stderrHash: string;
    stdoutTail?: string;
    stderrTail?: string;
    durationMs: number;
  },
): NodeExecResult {
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

// `mkdir -p` is already idempotent. We also chmod to the plan-declared mode
// so a re-run on a dir someone poked by hand converges back to spec.
export function mkdirSharedRootHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const mp = req.args.mountPoint === undefined
      ? DEFAULT_MOUNT
      : assertPath(req.args.mountPoint, 'mountPoint');
    const mode = assertMode(req.args.mode, 'mode', MKDIR_MODE);
    const mk = await exec(['mkdir', '-p', '-m', mode, mp], { timeoutMs: 10_000 });
    if (mk.exitCode !== 0) return toResult(req, mk);
    const ch = await exec(['chmod', mode, mp], { timeoutMs: 5_000 });
    return toResult(req, ch);
  };
}

// Canary round-trip: write a short random payload, read it back byte-for-
// byte, delete. Any mismatch — missing file, truncation, perms — becomes a
// non-zero exit code with a diagnostic stderrTail. This is the "did the
// mount actually land writable" check at the tail of every install plan.
export function testMountWriteHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const mp = req.args.mountPoint === undefined
      ? DEFAULT_MOUNT
      : assertPath(req.args.mountPoint, 'mountPoint');
    const canary = `swarmui-canary-${crypto.randomBytes(8).toString('hex')}`;
    const path = `${mp.replace(/\/$/, '')}/.${canary}`;
    const payload = crypto.randomBytes(16).toString('hex');

    // sh -c because `>` is a shell operator — we don't want to shell out
    // for the whole payload, just for the redirect.
    const write = await exec(
      ['sh', '-c', `printf %s "$1" > "$2"`, 'canary-write', payload, path],
      { timeoutMs: CANARY_TTL_SECONDS * 1000 },
    );
    if (write.exitCode !== 0) return toResult(req, write);

    const read = await exec(['cat', path], { timeoutMs: CANARY_TTL_SECONDS * 1000 });
    // Clean up regardless of read verdict — a leaked canary is worse than
    // one more exec call.
    await exec(['rm', '-f', path], { timeoutMs: CANARY_TTL_SECONDS * 1000 });

    if (read.exitCode !== 0) return toResult(req, read);
    // read.stdoutHash hashes the full stdout; compare against expected.
    const expectedHash = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex')
      .slice(0, 32);
    if (read.stdoutHash !== expectedHash) {
      return toResult(req, {
        exitCode: 1,
        stdoutHash: read.stdoutHash,
        stderrHash: crypto
          .createHash('sha256')
          .update('canary mismatch')
          .digest('hex')
          .slice(0, 32),
        stderrTail: `canary mismatch: expected ${expectedHash} got ${read.stdoutHash}`,
        durationMs: read.durationMs,
      });
    }
    return toResult(req, read);
  };
}
