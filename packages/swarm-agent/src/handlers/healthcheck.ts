import * as crypto from 'node:crypto';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';
import { defaultExec, type Exec, type ExecOutcome } from './exec';
import type { CommandHandler } from './types';

// SeaweedFS cluster healthcheck.
//
// Three checks, each over curl so the handler stays exec-only and
// unit-testable with a stubbed Exec:
//
//   1. GET  http://<master>/cluster/status   — master is up and knows the
//                                               cluster peer list
//   2. GET  http://<master>/vol/status       — count distinct volume
//                                               servers; must be ≥ the
//                                               expected count from the
//                                               plan (one per node)
//   3. GET  http://<filer>/                  — filer HTTP is answering;
//                                               the mount client won't
//                                               work without this
//
// `curl -fsS --max-time 10`: fail on 4xx/5xx, silent progress but keep
// stderr for diagnostics, hard client-side timeout so a stuck TCP
// handshake can't ride out the orchestrator's step timeout.
//
// We never trust the plan's master/filer values past this handler's
// regex; a tampered body with `master=evil.com:9333` is rejected before
// the first curl.

const HOSTPORT_RE = /^[a-z0-9][a-z0-9._-]{0,254}:[0-9]{1,5}$/i;
const CURL_TIMEOUT_SEC = 10;
const STEP_TIMEOUT_MS = 20_000;
// SeaweedFS /vol/status returns JSON with `"PublicUrl":"..."` per volume
// server; `-c` counts matching lines. Different field name across versions
// of SeaweedFS would break this — if the operator sees "found 0" when the
// cluster is clearly up, this is the first thing to look at.
const VOLUME_SERVER_FIELD = '"PublicUrl"';

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
    throw new Error(`healthcheck: invalid ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

function annotate(outcome: ExecOutcome, extra: string): ExecOutcome {
  return {
    ...outcome,
    stderrTail: outcome.stderrTail
      ? `${extra}: ${outcome.stderrTail}`
      : extra,
  };
}

export function seaweedfsHealthcheckHandler(
  exec: Exec = defaultExec,
): CommandHandler {
  return async (req) => {
    const master = assertStringMatch(req.args.master, HOSTPORT_RE, 'master');
    const filer = assertStringMatch(req.args.filer, HOSTPORT_RE, 'filer');
    const expectedRaw = req.args.expectedVolumeServers;
    const expected =
      typeof expectedRaw === 'number' ? expectedRaw : Number(expectedRaw);
    if (!Number.isInteger(expected) || expected < 1) {
      throw new Error(
        `healthcheck: expectedVolumeServers must be a positive integer; got ${JSON.stringify(expectedRaw)}`,
      );
    }

    // 1. Master cluster status.
    const clusterStatus = await exec(
      [
        'curl',
        '-fsS',
        '--max-time',
        String(CURL_TIMEOUT_SEC),
        `http://${master}/cluster/status`,
      ],
      { timeoutMs: STEP_TIMEOUT_MS },
    );
    if (clusterStatus.exitCode !== 0) {
      return toResult(req, annotate(clusterStatus, 'master /cluster/status unreachable'));
    }

    // 2. Volume server count: curl → grep -c the field we expect once per
    //    server. `|| true` on the pipe so grep's exit 1 (no match) doesn't
    //    kill the sh invocation before we read its stdout.
    const countOut = await exec(
      [
        'sh',
        '-c',
        `curl -fsS --max-time ${CURL_TIMEOUT_SEC} "$1" | grep -c '"'"'${VOLUME_SERVER_FIELD}'"'"' || true`,
        'count-volume-servers',
        `http://${master}/vol/status`,
      ],
      { timeoutMs: STEP_TIMEOUT_MS },
    );
    if (countOut.exitCode !== 0) {
      return toResult(req, annotate(countOut, 'master /vol/status unreachable'));
    }
    const parsed = Number.parseInt((countOut.stdoutTail ?? '').trim(), 10);
    const found = Number.isFinite(parsed) ? parsed : 0;
    if (found < expected) {
      const h = crypto
        .createHash('sha256')
        .update(`healthcheck:short:${found}/${expected}`)
        .digest('hex')
        .slice(0, 32);
      return toResult(req, {
        exitCode: 1,
        stdoutHash: countOut.stdoutHash,
        stderrHash: h,
        stderrTail: `expected ${expected} volume servers, found ${found}`,
        durationMs: countOut.durationMs,
      });
    }

    // 3. Filer HTTP.
    const filerUp = await exec(
      [
        'curl',
        '-fsS',
        '--max-time',
        String(CURL_TIMEOUT_SEC),
        `http://${filer}/`,
      ],
      { timeoutMs: STEP_TIMEOUT_MS },
    );
    if (filerUp.exitCode !== 0) {
      return toResult(req, annotate(filerUp, 'filer unreachable'));
    }

    const h = crypto
      .createHash('sha256')
      .update(`healthcheck:ok:${master}:${filer}:${expected}`)
      .digest('hex')
      .slice(0, 32);
    return toResult(req, {
      exitCode: 0,
      stdoutHash: h,
      stderrHash: h,
      stderrTail: `cluster healthy: master+filer up, ${found} volume server(s)`,
      durationMs: filerUp.durationMs,
    });
  };
}
