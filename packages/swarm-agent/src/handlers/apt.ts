import { defaultExec, type Exec } from './exec';
import type { CommandHandler } from './types';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';

// APT package installers. apt-get install is idempotent (returns 0 when the
// package is already at the required version) so these handlers do not
// pre-check. We always run `apt-get update` first, in a sibling exec, so a
// stale index doesn't fail an otherwise-valid install.
//
// DEBIAN_FRONTEND=noninteractive is critical: without it, a package with a
// debconf prompt would hang the agent until the exec timeout.

// Match strict Debian package name grammar so a tampered request can't
// chain in a shell expression. The whitelist in the plan generator makes
// this double-defence, not sole-defence, but double-defence costs nothing.
const PACKAGE_NAME_RE = /^[a-z0-9][a-z0-9+\-.]{0,63}$/;
const APT_TIMEOUT_MS = 300_000; // 5 min: slow mirrors are a real thing

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

export function aptInstallHandler(
  pkg: string,
  exec: Exec = defaultExec,
): CommandHandler {
  if (!PACKAGE_NAME_RE.test(pkg)) {
    throw new Error(`aptInstallHandler: invalid package name ${JSON.stringify(pkg)}`);
  }
  const env = { DEBIAN_FRONTEND: 'noninteractive' };
  return async (req) => {
    const update = await exec(
      ['apt-get', 'update', '-qq'],
      { env, timeoutMs: APT_TIMEOUT_MS },
    );
    // A failing `apt-get update` isn't always terminal (think flaky mirror),
    // but if `install` *also* fails later, surface the install failure since
    // that's what the operator cares about. We fall through either way.
    const install = await exec(
      ['apt-get', 'install', '-y', '-qq', '--no-install-recommends', pkg],
      { env, timeoutMs: APT_TIMEOUT_MS },
    );
    if (install.exitCode === 0) {
      return toResult(req, install);
    }
    // Pass through the install failure, but if update also failed, tag the
    // tail so the operator sees both.
    const annotated =
      update.exitCode !== 0
        ? {
            ...install,
            stderrTail:
              `apt-get update exited ${update.exitCode}\n` +
              (install.stderrTail ?? ''),
          }
        : install;
    return toResult(req, annotated);
  };
}
