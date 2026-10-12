import * as crypto from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NodeExecClient } from './node-exec.client';

// HMAC roundtrip tests. The agent (packages/swarm-agent, Sprint 3) will
// re-compute these exact bytes and reject anything that doesn't match, so this
// spec is the contract the agent spec reuses. Any change here is a protocol
// break.

const SECRET_32 = 'A'.repeat(32); // 32-byte minimum per client guard
const FIXED_NOW = 1_700_000_000;
const FIXED_NONCE = 'deadbeefdeadbeefdeadbeefdeadbeef';

function makeClient(secret: string): NodeExecClient {
  const cfg = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'AGENT_HMAC_SECRET') return secret;
      return fallback ?? '';
    }),
  } as unknown as ConfigService;
  return new NodeExecClient(cfg);
}

describe('NodeExecClient', () => {
  describe('buildRequest', () => {
    const base = {
      commandId: 'mkdir-swarmui-shared-root' as const,
      args: { path: '/var/lib/swarmui/shared' },
      nodeId: 'node02',
      installSessionId: 'sess-1',
      nowSec: FIXED_NOW,
      nonce: FIXED_NONCE,
    };

    it('produces a deterministic signature given fixed nonce/now/secret', () => {
      const client = makeClient(SECRET_32);
      const req = client.buildRequest(base);
      // exp = now + 5min
      expect(req.signature.exp).toBe(FIXED_NOW + 300);
      expect(req.signature.nonce).toBe(FIXED_NONCE);
      // Recompute the canonical bytes exactly as the agent will.
      const argvHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(base.args))
        .digest('hex');
      const canonical = [
        FIXED_NONCE,
        base.commandId,
        argvHash,
        base.nodeId,
        base.installSessionId,
        String(FIXED_NOW + 300),
      ].join('\n');
      const expectedHmac = crypto
        .createHmac('sha256', SECRET_32)
        .update(canonical)
        .digest('hex');
      expect(req.signature.hmac).toBe(expectedHmac);
    });

    it('produces different hmacs when args differ', () => {
      const client = makeClient(SECRET_32);
      const a = client.buildRequest(base);
      const b = client.buildRequest({ ...base, args: { path: '/other' } });
      expect(a.signature.hmac).not.toBe(b.signature.hmac);
    });

    it('produces different hmacs when nodeId differs (per-node binding)', () => {
      const client = makeClient(SECRET_32);
      const a = client.buildRequest(base);
      const b = client.buildRequest({ ...base, nodeId: 'node03' });
      expect(a.signature.hmac).not.toBe(b.signature.hmac);
    });

    it('produces different hmacs when installSessionId differs', () => {
      const client = makeClient(SECRET_32);
      const a = client.buildRequest(base);
      const b = client.buildRequest({ ...base, installSessionId: 'sess-2' });
      expect(a.signature.hmac).not.toBe(b.signature.hmac);
    });

    it('generates a fresh nonce when none is supplied', () => {
      const client = makeClient(SECRET_32);
      const a = client.buildRequest({ ...base, nonce: undefined });
      const b = client.buildRequest({ ...base, nonce: undefined });
      expect(a.signature.nonce).not.toBe(b.signature.nonce);
      // Nonce must be ≥ 128 bits of entropy (16 bytes = 32 hex chars).
      expect(a.signature.nonce).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generates a now-based exp when nowSec is not supplied', () => {
      const client = makeClient(SECRET_32);
      const before = Math.floor(Date.now() / 1000);
      const req = client.buildRequest({ ...base, nowSec: undefined });
      const after = Math.floor(Date.now() / 1000);
      expect(req.signature.exp).toBeGreaterThanOrEqual(before + 300);
      expect(req.signature.exp).toBeLessThanOrEqual(after + 301);
    });
  });

  describe('send', () => {
    let module: TestingModule;

    const build = async (secret: string) => {
      module = await Test.createTestingModule({
        providers: [
          NodeExecClient,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, fallback?: string) =>
                key === 'AGENT_HMAC_SECRET' ? secret : fallback ?? '',
              ),
            },
          },
        ],
      }).compile();
      return module.get(NodeExecClient);
    };

    const dummyReq = (client: NodeExecClient) =>
      client.buildRequest({
        commandId: 'test-mount-write',
        args: { path: '/var/lib/swarmui/shared' },
        nodeId: 'node02',
        installSessionId: 'sess-1',
      });

    it('refuses outbound calls when the secret is missing', async () => {
      const client = await build('');
      const req = dummyReq(client);
      await expect(client.send(req)).rejects.toThrow(
        /AGENT_HMAC_SECRET not configured/,
      );
    });

    it('refuses outbound calls when the secret is < 32 chars', async () => {
      const client = await build('tooshort');
      const req = dummyReq(client);
      await expect(client.send(req)).rejects.toThrow(
        /AGENT_HMAC_SECRET not configured/,
      );
    });

    it('throws not-implemented when configured (Sprint 3 lands the transport)', async () => {
      const client = await build(SECRET_32);
      const req = dummyReq(client);
      await expect(client.send(req)).rejects.toThrow(
        /not implemented \(Sprint 3\)/,
      );
    });
  });
});
