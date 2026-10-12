import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';

// Low-level process runner used by every real command handler. Captures
// stdout/stderr into bounded buffers (large output never balloons agent
// memory), returns sha256 digests plus small ASCII tails, and enforces a
// hard wall-clock timeout — a stuck apt or docker pull cannot pin the
// agent forever.
//
// This file is intentionally the only place in swarm-agent that reaches
// for child_process; the rest of the handler surface is a thin shell
// over this.

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER_BYTES = 1 << 20; // 1 MiB per stream — plenty for apt-get
const TAIL_BYTES = 2048;
const TIMEOUT_EXIT_CODE = 124; // GNU timeout convention

export interface ExecOptions {
  env?: Record<string, string>;
  timeoutMs?: number;
  maxBufferBytes?: number;
  cwd?: string;
  // Pipe this to stdin and then end — used by `tee /etc/*` style flows.
  stdin?: string;
}

export interface ExecOutcome {
  exitCode: number;
  stdoutHash: string;
  stderrHash: string;
  stdoutTail?: string;
  stderrTail?: string;
  durationMs: number;
}

export type Exec = (argv: string[], opts?: ExecOptions) => Promise<ExecOutcome>;

function sha256Trunc(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

function tailAscii(buf: Buffer): string | undefined {
  if (buf.length === 0) return undefined;
  const slice = buf.subarray(Math.max(0, buf.length - TAIL_BYTES));
  // Agent audit paths assume ASCII-only tails; non-printable bytes are
  // dropped so a binary blob in stderr can't poison the log stream.
  return slice.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

// Bounded accumulator — chunks past the cap are counted but dropped so the
// hash still reflects total length (we hash incrementally) and we don't
// swallow more memory than the operator budgeted.
class BoundedBuffer {
  private readonly cap: number;
  private readonly chunks: Buffer[] = [];
  private readonly hash = crypto.createHash('sha256');
  private kept = 0;
  totalBytes = 0;

  constructor(cap: number) {
    this.cap = cap;
  }

  push(chunk: Buffer): void {
    this.totalBytes += chunk.length;
    this.hash.update(chunk);
    if (this.kept >= this.cap) return;
    const room = this.cap - this.kept;
    const slice = chunk.length <= room ? chunk : chunk.subarray(0, room);
    this.chunks.push(slice);
    this.kept += slice.length;
  }

  finalizeTail(): string | undefined {
    return tailAscii(Buffer.concat(this.chunks, this.kept));
  }

  finalizeHash(): string {
    return this.hash.digest('hex').slice(0, 32);
  }
}

export const defaultExec: Exec = (argv, opts = {}) => {
  if (argv.length === 0) {
    return Promise.resolve({
      exitCode: 1,
      stdoutHash: sha256Trunc(Buffer.alloc(0)),
      stderrHash: sha256Trunc(Buffer.from('empty argv')),
      stderrTail: 'empty argv',
      durationMs: 0,
    });
  }
  const [cmd, ...rest] = argv;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuf = opts.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const started = Date.now();

  return new Promise<ExecOutcome>((resolve) => {
    const child = spawn(cmd, rest, {
      env: { ...process.env, ...(opts.env ?? {}) },
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = new BoundedBuffer(maxBuf);
    const err = new BoundedBuffer(maxBuf);
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      // SIGKILL — SIGTERM is politer but handlers that ignore it (apt-get in
      // a lock-wait) would hang forever. The agent is a trusted service on
      // the host; killing hard is correct here.
      try {
        child.kill('SIGKILL');
      } catch {
        /* already dead */
      }
      settled = true;
      resolve({
        exitCode: TIMEOUT_EXIT_CODE,
        stdoutHash: out.finalizeHash(),
        stderrHash: err.finalizeHash(),
        stdoutTail: out.finalizeTail(),
        stderrTail: `timeout after ${timeoutMs}ms`,
        durationMs: Date.now() - started,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));

    child.on('error', (e) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      // Spawn failed (ENOENT etc.) — treat as 127, "command not found".
      resolve({
        exitCode: 127,
        stdoutHash: out.finalizeHash(),
        stderrHash: sha256Trunc(Buffer.from(e.message)),
        stderrTail: e.message.slice(0, TAIL_BYTES),
        durationMs: Date.now() - started,
      });
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      // A kill-by-signal (not by timeout) still returns a result the
      // backend can audit; exit code is coerced to 128+signo to match
      // POSIX shell convention.
      const exitCode =
        code != null ? code : signal ? 128 + (signalToNumber(signal) ?? 0) : 1;
      resolve({
        exitCode,
        stdoutHash: out.finalizeHash(),
        stderrHash: err.finalizeHash(),
        stdoutTail: out.finalizeTail(),
        stderrTail: err.finalizeTail(),
        durationMs: Date.now() - started,
      });
    });

    // C pack #6: a child that dies before we finish writing its stdin
    // (`tee /etc/no-such-dir`, `true` with a long payload, etc.) can
    // either (a) emit an EPIPE error on child.stdin asynchronously or
    // (b) throw synchronously from .end() with ERR_STREAM_DESTROYED. The
    // 'error' listener covers (a); the try/catch covers (b). Without
    // either, Node treats it as an unhandled error and kills the agent
    // — a single bad step would take down the worker. The child's exit
    // code is still captured via the normal 'close' path below.
    child.stdin.on('error', () => {
      /* child closed stdin first; exit-code path reports the real failure */
    });

    try {
      if (opts.stdin !== undefined) {
        child.stdin.end(opts.stdin);
      } else {
        child.stdin.end();
      }
    } catch {
      /* synchronous ERR_STREAM_DESTROYED; close event will still fire */
    }
  });
};

const SIGNAL_NUMBERS: Record<string, number> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGKILL: 9,
  SIGTERM: 15,
};
function signalToNumber(sig: string | NodeJS.Signals): number | undefined {
  return SIGNAL_NUMBERS[sig as string];
}
