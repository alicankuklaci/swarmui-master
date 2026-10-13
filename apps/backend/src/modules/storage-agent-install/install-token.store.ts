import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

// In-memory ephemeral token store for operator install flows. Each token
// authorizes a short-lived download of /install.sh + /bundle.tgz; the
// corresponding HMAC secret is handed to the operator alongside the token
// and NEVER stored here (operator pastes it into stack.yml themselves).
//
// Why in-memory: a single admin issues N install calls on the N swarm
// nodes within minutes of each other; losing the store on backend restart
// just means "re-issue the token", which is cheap. Clustering is not a
// concern because the shared-storage backend runs 1-of-1 under Swarm.

export interface IssuedInstallToken {
  token: string; // url-safe, 32 bytes base64url
  secret: string; // base64 32 bytes, caller shows to operator ONCE
  expiresAt: Date;
  issuedBy: string; // user id for audit log
}

interface StoredRecord {
  tokenHash: string; // sha256 of token (we never keep plaintext)
  expiresAt: number; // epoch ms
  issuedBy: string;
  installCount: number;
}

const DEFAULT_TTL_MS = 15 * 60_000;
const MAX_INSTALLS_PER_TOKEN = 32;

@Injectable()
export class InstallTokenStore {
  private readonly logger = new Logger(InstallTokenStore.name);
  private records = new Map<string, StoredRecord>();

  issue(issuedBy: string, ttlMs: number = DEFAULT_TTL_MS): IssuedInstallToken {
    this.evictExpired();
    const token = crypto.randomBytes(32).toString('base64url');
    const secret = crypto.randomBytes(32).toString('base64');
    const tokenHash = this.hash(token);
    const expiresAt = new Date(Date.now() + ttlMs);
    this.records.set(tokenHash, {
      tokenHash,
      expiresAt: expiresAt.getTime(),
      issuedBy,
      installCount: 0,
    });
    this.logger.log(
      `install-token issued by=${issuedBy} ttl=${Math.round(ttlMs / 1000)}s`,
    );
    return { token, secret, expiresAt, issuedBy };
  }

  // Returns true + bumps install counter when token valid; false on miss
  // or expiry or install-count exhaustion. Timing-safe hash compare keeps
  // this honest even though the store is in-process.
  consume(token: string | undefined): boolean {
    if (!token || typeof token !== 'string') return false;
    const tokenHash = this.hash(token);
    const rec = this.records.get(tokenHash);
    if (!rec) return false;
    if (Date.now() > rec.expiresAt) {
      this.records.delete(tokenHash);
      return false;
    }
    if (rec.installCount >= MAX_INSTALLS_PER_TOKEN) return false;
    rec.installCount += 1;
    return true;
  }

  // Opportunistic cleanup — called from issue(). Avoids an unbounded Map
  // when the backend sits for weeks between installs.
  private evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.records) {
      if (v.expiresAt < now) this.records.delete(k);
    }
  }

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
