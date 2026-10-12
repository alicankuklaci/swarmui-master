import * as crypto from 'node:crypto';
import type { NodeExecCommandId, NodeExecRequest } from './command.types';

// Shared HMAC construction. Both NodeExecClient (backend) and swarm-agent
// (node side) import from here so the wire format is a single source of
// truth — a drift between the two silently rejects every install.
//
// Canonical bytes (newline-separated, no trailing newline):
//
//   nonce
//   commandId
//   sha256(JSON.stringify(args))        // hex
//   nodeId
//   installSessionId
//   exp
//
// The agent re-computes these bytes from the received envelope and compares
// against the HMAC the client sent (constant-time compare).

export const HMAC_ALGORITHM = 'sha256' as const;
export const DEFAULT_EXP_WINDOW_SEC = 300; // 5 minutes
export const HMAC_SECRET_MIN_BYTES = 32;

export interface CanonicalInput {
  nonce: string;
  commandId: NodeExecCommandId;
  args: Record<string, string | number | boolean>;
  nodeId: string;
  installSessionId: string;
  exp: number;
}

export function canonicalBytes(input: CanonicalInput): string {
  const argvHash = crypto
    .createHash(HMAC_ALGORITHM)
    .update(JSON.stringify(input.args))
    .digest('hex');
  return [
    input.nonce,
    input.commandId,
    argvHash,
    input.nodeId,
    input.installSessionId,
    String(input.exp),
  ].join('\n');
}

export function computeHmac(input: CanonicalInput, secret: string): string {
  return crypto
    .createHmac(HMAC_ALGORITHM, secret)
    .update(canonicalBytes(input))
    .digest('hex');
}

export interface HmacVerifyResult {
  ok: boolean;
  // One of the reason codes. Agents log this as the dispatch reject reason
  // without echoing the HMAC or the secret.
  reason:
    | 'ok'
    | 'expired'
    | 'bad-signature'
    | 'short-secret'
    | 'bad-shape'
    | 'nonce-replay';
}

// Nonce replay store. The agent consults this *after* HMAC verification
// passes — a successful first use must be recorded, and a repeated nonce
// within the expiration window is rejected as a replay. Implementations
// drop entries older than DEFAULT_EXP_WINDOW_SEC so memory stays bounded.
export interface NonceStore {
  // Record the nonce as seen with an absolute expiration (unix seconds).
  // Returns true if the nonce was previously unseen (first use), false if
  // it was already recorded. Must be atomic — a check-then-record race
  // would let two in-flight requests with the same captured HMAC both land.
  checkAndRecord(nonce: string, expSec: number, nowSec: number): boolean;
}

// Default in-memory nonce store. Lives per-agent-process. On agent restart
// the window resets (fine — the HMAC's own `exp` becomes the floor). A
// 5-min window + the per-node request rate puts this at a few hundred
// entries steady-state, so a Map suffices; we scavenge opportunistically
// on each call to avoid a background timer.
export class InMemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>(); // nonce → expSec

  checkAndRecord(nonce: string, expSec: number, nowSec: number): boolean {
    this.scavenge(nowSec);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, expSec);
    return true;
  }

  private scavenge(nowSec: number): void {
    // Opportunistic: amortizes to O(n) over n inserts, which keeps the
    // common path a plain Map lookup.
    for (const [k, exp] of this.seen) {
      if (exp < nowSec) this.seen.delete(k);
    }
  }

  // Exposed for tests + diagnostics only. Not part of the NonceStore
  // interface — callers should not depend on it.
  size(): number {
    return this.seen.size;
  }
}

export function verifyNodeExecRequest(
  req: NodeExecRequest,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  nonceStore?: NonceStore,
): HmacVerifyResult {
  if (typeof secret !== 'string' || secret.length < HMAC_SECRET_MIN_BYTES) {
    return { ok: false, reason: 'short-secret' };
  }
  const sig = req.signature;
  if (
    !sig ||
    typeof sig.nonce !== 'string' ||
    typeof sig.exp !== 'number' ||
    typeof sig.hmac !== 'string'
  ) {
    return { ok: false, reason: 'bad-shape' };
  }
  if (sig.exp < nowSec) {
    return { ok: false, reason: 'expired' };
  }
  const expected = computeHmac(
    {
      nonce: sig.nonce,
      commandId: req.commandId,
      args: req.args,
      nodeId: req.nodeId,
      installSessionId: req.installSessionId,
      exp: sig.exp,
    },
    secret,
  );
  // Constant-time compare prevents timing oracles on partial-prefix matches.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig.hmac, 'hex');
  if (a.length !== b.length) {
    return { ok: false, reason: 'bad-signature' };
  }
  const equal = crypto.timingSafeEqual(a, b);
  if (!equal) return { ok: false, reason: 'bad-signature' };
  // Nonce check runs AFTER signature verification: an attacker without the
  // HMAC secret cannot pollute the store with arbitrary nonces, and a bad-
  // signature request isn't counted as a "first use" of the nonce.
  if (nonceStore) {
    const fresh = nonceStore.checkAndRecord(sig.nonce, sig.exp, nowSec);
    if (!fresh) return { ok: false, reason: 'nonce-replay' };
  }
  return { ok: true, reason: 'ok' };
}
