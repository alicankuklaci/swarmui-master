import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import type { NodeExecResult } from '@swarmui-master/storage-plan';
import { StorageAuditService } from './audit.service';
import { StorageAuditLog } from './schemas/storage-audit.schema';

// Dual-sink audit writer tests. The whole point of two sinks is that the
// install audit survives one of them being down — including Mongo, which this
// module exists to protect. Each test exercises one failure mode and asserts
// the behavior spelled out in the design doc:
//
//   both ok      → resolves
//   mongo-only   → resolves (file sink down, Mongo wrote)
//   file-only    → resolves (Mongo unreachable, file wrote)
//   both failed  → throws (caller aborts the install step)
//   args > 1KB   → persisted entry carries `argsTruncated: true` and no
//                  structured args (just a short tail), never the full blob.

describe('StorageAuditService', () => {
  const baseResult: NodeExecResult = {
    commandId: 'mkdir-swarmui-shared-root',
    nodeId: 'node02',
    exitCode: 0,
    stdoutHash: 'a'.repeat(32),
    stderrHash: 'b'.repeat(32),
    durationMs: 42,
  };

  let service: StorageAuditService;
  let mongoCreate: jest.Mock;
  let appendFileSpy: jest.SpyInstance;
  let tmpDir: string;

  const buildModule = async (
    fileMirror: 'true' | 'false' = 'true',
  ): Promise<TestingModule> => {
    mongoCreate = jest.fn().mockResolvedValue({ _id: 'x' });
    const mod = await Test.createTestingModule({
      providers: [
        StorageAuditService,
        {
          provide: getModelToken(StorageAuditLog.name),
          useValue: { create: mongoCreate },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback: string) => {
              if (key === 'STORAGE_AUDIT_DIR') return tmpDir;
              if (key === 'STORAGE_AUDIT_FILE_MIRROR') return fileMirror;
              return fallback;
            }),
          },
        },
      ],
    }).compile();
    return mod;
  };

  beforeEach(async () => {
    // Real tmp dir so the service's `ensureAuditDir` runs harmlessly against
    // the filesystem; we spy only on the write path to simulate failures.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmui-audit-'));
    appendFileSpy = jest
      .spyOn(fs.promises, 'appendFile')
      .mockResolvedValue(undefined);
    const mod = await buildModule();
    service = mod.get(StorageAuditService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort tmp cleanup */
    }
  });

  it('writes to both sinks on the happy path', async () => {
    await service.write({
      userId: 'u1',
      installSessionId: 's1',
      result: baseResult,
      args: { foo: 'bar' },
    });
    expect(mongoCreate).toHaveBeenCalledTimes(1);
    expect(appendFileSpy).toHaveBeenCalledTimes(1);
    const [, line] = appendFileSpy.mock.calls[0];
    expect(typeof line).toBe('string');
    expect((line as string).endsWith('\n')).toBe(true);
    const parsed = JSON.parse((line as string).trimEnd());
    expect(parsed.commandId).toBe('mkdir-swarmui-shared-root');
    expect(parsed.argsTruncated).toBe(false);
  });

  it('resolves when the file sink fails (mongo-only)', async () => {
    appendFileSpy.mockRejectedValueOnce(new Error('EROFS'));
    await expect(
      service.write({
        userId: 'u1',
        installSessionId: 's1',
        result: baseResult,
        args: { foo: 'bar' },
      }),
    ).resolves.toBeUndefined();
    expect(mongoCreate).toHaveBeenCalledTimes(1);
  });

  it('resolves when Mongo rejects (file-only)', async () => {
    // This is the exact scenario the file-mirror exists for: Mongo is the
    // thing we are about to repair, so it must not be in the critical path
    // of the install audit.
    mongoCreate.mockRejectedValueOnce(new Error('MongoNotConnected'));
    await expect(
      service.write({
        userId: 'u1',
        installSessionId: 's1',
        result: baseResult,
        args: { foo: 'bar' },
      }),
    ).resolves.toBeUndefined();
    expect(appendFileSpy).toHaveBeenCalledTimes(1);
  });

  it('throws when both sinks fail', async () => {
    mongoCreate.mockRejectedValueOnce(new Error('MongoNotConnected'));
    appendFileSpy.mockRejectedValueOnce(new Error('EROFS'));
    await expect(
      service.write({
        userId: 'u1',
        installSessionId: 's1',
        result: baseResult,
        args: { foo: 'bar' },
      }),
    ).rejects.toThrow(/both Mongo and file-mirror writes failed/);
  });

  it('truncates oversize args and marks the entry', async () => {
    const big = 'A'.repeat(2048);
    await service.write({
      userId: 'u1',
      installSessionId: 's1',
      result: baseResult,
      args: { payload: big },
    });
    const persisted = mongoCreate.mock.calls[0][0];
    expect(persisted.argsTruncated).toBe(true);
    // Structured args are dropped; the entry carries a `_truncated` tail only.
    expect(persisted.args).toHaveProperty('_truncated');
    expect(persisted.args.payload).toBeUndefined();
    // And the serialized tail fits inside the 1 KiB budget.
    expect(Buffer.byteLength(persisted.args._truncated, 'utf8')).toBeLessThanOrEqual(1024);
  });

  it('uses the SHA-256 helper that matches the writer', () => {
    const h = StorageAuditService.hashOutput('hello');
    // sha256('hello') = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e');
    expect(h).toHaveLength(32);
  });

  it('creates the audit directory at boot', () => {
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it('skips the file sink when STORAGE_AUDIT_FILE_MIRROR=false', async () => {
    const mod = await buildModule('false');
    const svc = mod.get(StorageAuditService);
    appendFileSpy.mockClear();
    await svc.write({
      userId: 'u1',
      installSessionId: 's1',
      result: baseResult,
      args: { foo: 'bar' },
    });
    expect(mongoCreate).toHaveBeenCalledTimes(1);
    expect(appendFileSpy).not.toHaveBeenCalled();
  });

  it('B pack #3: throws when Mongo fails and file-mirror is disabled (fail-closed)', async () => {
    // Previously `file` resolved to a bare `true` when FILE_MIRROR=false,
    // which made `fileOk` always truthy and let a Mongo failure drop the
    // audit entry silently. In single-sink mode Mongo *is* the audit, so
    // its failure must terminate the install step — otherwise an attacker
    // scrubbing the trail just needs to flip the env var.
    const mod = await buildModule('false');
    const svc = mod.get(StorageAuditService);
    mongoCreate.mockRejectedValueOnce(new Error('MongoNotConnected'));
    await expect(
      svc.write({
        userId: 'u1',
        installSessionId: 's1',
        result: baseResult,
        args: { foo: 'bar' },
      }),
    ).rejects.toThrow(/Mongo write failed/);
  });
});
