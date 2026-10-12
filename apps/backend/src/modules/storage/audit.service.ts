import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import type { NodeExecResult, StorageAuditEntry } from '@swarmui-master/storage-plan';
import { StorageAuditLog, StorageAuditLogDocument } from './schemas/storage-audit.schema';

// Default directory for the file-mirror. Lives under /var/lib/swarmui so it's
// outside the shared-storage mount point (`/var/lib/swarmui/shared`) — if the
// shared FS is the thing failing, the audit log of that failure must not live
// on it.
const DEFAULT_AUDIT_DIR = '/var/lib/swarmui/audit';
const AUDIT_FILE = 'node-exec.log';
const ARGS_MAX_BYTES = 1024;

function sha256TruncHex(buf: Buffer | string): string {
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  return h.slice(0, 32);
}

function safeStringify(obj: Record<string, unknown>): { s: string; truncated: boolean } {
  const s = JSON.stringify(obj);
  if (Buffer.byteLength(s, 'utf8') <= ARGS_MAX_BYTES) return { s, truncated: false };
  // Truncate to a safe UTF-8 boundary by slicing the Buffer.
  const buf = Buffer.from(s, 'utf8').subarray(0, ARGS_MAX_BYTES);
  return { s: buf.toString('utf8'), truncated: true };
}

export interface AuditWriteInput {
  userId: string;
  installSessionId: string;
  result: NodeExecResult;
  args: Record<string, string | number | boolean>;
}

@Injectable()
export class StorageAuditService {
  private readonly logger = new Logger(StorageAuditService.name);
  private readonly auditDir: string;
  private readonly fileEnabled: boolean;

  constructor(
    @InjectModel(StorageAuditLog.name)
    private readonly auditModel: Model<StorageAuditLogDocument>,
    private readonly config: ConfigService,
  ) {
    this.auditDir = this.config.get<string>('STORAGE_AUDIT_DIR', DEFAULT_AUDIT_DIR);
    this.fileEnabled = this.config.get<string>('STORAGE_AUDIT_FILE_MIRROR', 'true') !== 'false';
    if (this.fileEnabled) this.ensureAuditDir();
  }

  // Both sinks are best-effort individually, but the method succeeds as long as
  // *either* lands. Mongo-only is OK during development; file-only is the whole
  // point of the mirror (the Mongo this module protects may be unreachable).
  async write(input: AuditWriteInput): Promise<void> {
    const { s, truncated } = safeStringify(input.args);
    const argsForEntry = truncated
      ? { _truncated: s } // keep a short tail, drop structure, mark explicitly
      : (input.args as Record<string, string | number | boolean>);

    const entry: StorageAuditEntry = {
      ts: new Date().toISOString(),
      userId: input.userId,
      installSessionId: input.installSessionId,
      nodeId: input.result.nodeId,
      commandId: input.result.commandId,
      args: argsForEntry as Record<string, string | number | boolean>,
      argsTruncated: truncated,
      exitCode: input.result.exitCode,
      stdoutHash: input.result.stdoutHash,
      stderrHash: input.result.stderrHash,
      durationMs: input.result.durationMs,
    };

    const mongo = this.writeMongo(entry).catch((err) => {
      this.logger.error(`audit mongo write failed: ${err?.message || err}`);
      return false as const;
    });
    const file = this.fileEnabled
      ? this.writeFile(entry).catch((err) => {
          this.logger.error(`audit file write failed: ${err?.message || err}`);
          return false as const;
        })
      : Promise.resolve(true);

    const [mongoOk, fileOk] = await Promise.all([mongo, file]);
    if (mongoOk === false && fileOk === false) {
      // Rare: both sinks failed. Surface so the caller can abort the install.
      throw new Error('storage audit: both Mongo and file-mirror writes failed');
    }
  }

  // Exposed for tests that want to compute hashes consistently with the writer.
  static hashOutput(buf: Buffer | string): string {
    return sha256TruncHex(buf);
  }

  private async writeMongo(entry: StorageAuditEntry): Promise<true> {
    await this.auditModel.create({
      userId: entry.userId,
      installSessionId: entry.installSessionId,
      nodeId: entry.nodeId,
      commandId: entry.commandId,
      args: entry.args,
      argsTruncated: entry.argsTruncated ?? false,
      exitCode: entry.exitCode,
      stdoutHash: entry.stdoutHash,
      stderrHash: entry.stderrHash,
      durationMs: entry.durationMs,
    });
    return true;
  }

  private async writeFile(entry: StorageAuditEntry): Promise<true> {
    const line = JSON.stringify(entry) + '\n';
    await fs.promises.appendFile(path.join(this.auditDir, AUDIT_FILE), line, {
      encoding: 'utf8',
      mode: 0o640,
    });
    return true;
  }

  private ensureAuditDir(): void {
    try {
      fs.mkdirSync(this.auditDir, { recursive: true, mode: 0o750 });
    } catch (err) {
      // Non-fatal at boot — writeFile will retry on first write. Logged so
      // operators notice if the mount point isn't owned by the backend user.
      this.logger.warn(`cannot create ${this.auditDir}: ${(err as Error).message}`);
    }
  }
}
