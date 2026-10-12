import * as crypto from 'node:crypto';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';
import { defaultExec, type Exec, type ExecOutcome } from './exec';
import type { CommandHandler } from './types';

// Firewall handler.
//
//   firewall-allow-seaweedfs-ports → add iptables ACCEPT rules on INPUT
//                                     (install) or delete them (uninstall).
//
// Why iptables and not ufw: ufw is Debian/Ubuntu-flavoured and sometimes
// swallows rules in favour of its own rule table; iptables is universal.
// Operators who already use ufw can set its global policy themselves —
// the plan's rules are tagged with a comment so an audit on the host
// shows exactly which rules this agent owns.
//
// Scope note: for v1 the "overlay" scope in the plan body is informational
// only — the handler opens the port globally and tags the comment with
// scope=<arg>. Overlay-aware source filtering is a Sprint 4 follow-up when
// enumerateConsumers can tell us the overlay subnet.
//
// Idempotency: `iptables -A` happily appends duplicates. We `-C` (check)
// first; if the rule already exists, skip. On revoke, repeated deletes
// are harmless — `-D` on a missing rule returns 1, which we treat as
// already-revoked and swallow.

const PORT_RE = /^[0-9]{1,5}$/;
const SCOPE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const RULE_COMMENT_PREFIX = 'swarmui-seaweedfs';
const FIREWALL_TIMEOUT_MS = 15_000;

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

function parsePorts(raw: unknown): number[] {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('firewall handler: ports must be a comma-separated string');
  }
  const parts = raw.split(',').map((s) => s.trim());
  for (const p of parts) {
    if (!PORT_RE.test(p)) {
      throw new Error(`firewall handler: invalid port ${JSON.stringify(p)}`);
    }
  }
  return parts.map((p) => Number(p));
}

function ruleArgs(port: number, comment: string): string[] {
  return [
    '-p',
    'tcp',
    '--dport',
    String(port),
    '-j',
    'ACCEPT',
    '-m',
    'comment',
    '--comment',
    comment,
  ];
}

export function firewallAllowPortsHandler(exec: Exec = defaultExec): CommandHandler {
  return async (req) => {
    const ports = parsePorts(req.args.ports);
    const scope =
      typeof req.args.scope === 'string' && SCOPE_RE.test(req.args.scope)
        ? req.args.scope
        : 'default';
    const revoke = req.args.action === 'revoke';

    // Aggregate per-port results. If any individual rule fails hard, we
    // return that outcome (the backend records the step as failed and the
    // orchestrator moves to UNINSTALL_FAILED). On revoke, missing rules
    // are a success — "already gone" is the goal state.
    for (const port of ports) {
      const comment = `${RULE_COMMENT_PREFIX}-${scope}-${port}`;
      const spec = ['INPUT', ...ruleArgs(port, comment)];

      if (revoke) {
        const del = await exec(['iptables', '-D', ...spec], {
          timeoutMs: FIREWALL_TIMEOUT_MS,
        });
        // Exit 1 on `-D` means "no such rule" — fine for revoke.
        if (del.exitCode !== 0 && del.exitCode !== 1) {
          return toResult(req, del);
        }
        continue;
      }

      // Install path: check-then-add. `-C` returns 0 if the rule exists,
      // 1 if it does not. Any other code is a real error.
      const check = await exec(['iptables', '-C', ...spec], {
        timeoutMs: FIREWALL_TIMEOUT_MS,
      });
      if (check.exitCode === 0) continue; // already in place
      if (check.exitCode !== 1) return toResult(req, check);

      const add = await exec(['iptables', '-A', ...spec], {
        timeoutMs: FIREWALL_TIMEOUT_MS,
      });
      if (add.exitCode !== 0) return toResult(req, add);
    }

    // All ports converged — synthesize an "all green" outcome. We don't
    // bubble up the last iptables call's hashes because they only describe
    // the final port; an aggregate zero result is less misleading.
    const h = crypto
      .createHash('sha256')
      .update(`firewall:${revoke ? 'revoke' : 'allow'}:${ports.join(',')}`)
      .digest('hex')
      .slice(0, 32);
    return toResult(req, {
      exitCode: 0,
      stdoutHash: h,
      stderrHash: h,
      durationMs: 0,
    });
  };
}
