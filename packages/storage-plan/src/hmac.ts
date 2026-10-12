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
  // One of: 'ok' | 'expired' | 'bad-signature' | 'short-secret' | 'bad-shape'.
  // Agents log this as the dispatch reject reason without echoing the HMAC
  // or the secret.
  reason: 'ok' | 'expired' | 'bad-signature' | 'short-secret' | 'bad-shape';
}

export function verifyNodeExecRequest(
  req: NodeExecRequest,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
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
  return equal ? { ok: true, reason: 'ok' } : { ok: false, reason: 'bad-signature' };
}
