import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  computeHmac,
  verifyNodeExecRequest,
  type NodeExecRequest,
  type NodeExecResult,
} from '@swarmui-master/storage-plan';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WebSocketServer } = require('ws');
import { NodeExecClient } from './node-exec.client';

// HMAC roundtrip + real WebSocket transport. The spec covers two concerns
// that must stay in lockstep across the backend and the swarm-agent:
//   1. The exact canonical bytes used for signing — any change here is a
//      protocol break and must land as a conscious wire-format bump.
//   2. The send() lifecycle: open ws, send request, read response, close.
//      A spec against a tiny ws fixture catches regressions the orchestrator
//      spec can't (that one mocks NodeExecClient).

const SECRET_32 = 'A'.repeat(32);
const FIXED_NOW = 1_700_000_000;
const FIXED_NONCE = 'deadbeefdeadbeefdeadbeefdeadbeef';

function makeClient(
  secret: string,
  overrides: Record<string, string> = {},
): NodeExecClient {
  const cfg = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key in overrides) return overrides[key];
      if (key === 'AGENT_HMAC_SECRET') return secret;
      return fallback ?? '';
    }),
  } as unknown as ConfigService;
  return new NodeExecClient(cfg);
}

describe('NodeExecClient', () => {
  describe('buildRequest (HMAC)', () => {
    const base = {
      commandId: 'mkdir-swarmui-shared-root' as const,
      args: { path: '/var/lib/swarmui/shared' },
      nodeId: 'node02',
      installSessionId: 'sess-1',
      nowSec: FIXED_NOW,
      nonce: FIXED_NONCE,
    };

    it('produces a deterministic signature matching the shared canonical form', () => {
      const client = makeClient(SECRET_32);
      const req = client.buildRequest(base);
      expect(req.signature.exp).toBe(FIXED_NOW + 300);
      expect(req.signature.nonce).toBe(FIXED_NONCE);
      // Recompute via the shared helper the agent will use.
      const expected = computeHmac(
        {
          nonce: FIXED_NONCE,
          commandId: base.commandId,
          args: base.args,
          nodeId: base.nodeId,
          installSessionId: base.installSessionId,
          exp: FIXED_NOW + 300,
        },
        SECRET_32,
      );
      expect(req.signature.hmac).toBe(expected);
    });

    it('agent-side verifyNodeExecRequest accepts a freshly-built request', () => {
      const client = makeClient(SECRET_32);
      const req = client.buildRequest(base);
      const r = verifyNodeExecRequest(req, SECRET_32, FIXED_NOW + 299);
      expect(r.ok).toBe(true);
      expect(r.reason).toBe('ok');
    });

    it('verifier rejects a tampered args payload (hmac binds args)', () => {
      const client = makeClient(SECRET_32);
      const req = client.buildRequest(base);
      const tampered: NodeExecRequest = {
        ...req,
        args: { path: '/different' },
      };
      const r = verifyNodeExecRequest(tampered, SECRET_32, FIXED_NOW + 10);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('bad-signature');
    });

    it('verifier rejects an expired signature', () => {
      const client = makeClient(SECRET_32);
      const req = client.buildRequest(base);
      const r = verifyNodeExecRequest(req, SECRET_32, FIXED_NOW + 400);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('expired');
    });

    it('produces different hmacs when any binding input changes', () => {
      const client = makeClient(SECRET_32);
      const a = client.buildRequest(base);
      const b = client.buildRequest({ ...base, args: { path: '/other' } });
      const c = client.buildRequest({ ...base, nodeId: 'node03' });
      const d = client.buildRequest({ ...base, installSessionId: 'sess-2' });
      const hmacs = new Set([
        a.signature.hmac,
        b.signature.hmac,
        c.signature.hmac,
        d.signature.hmac,
      ]);
      expect(hmacs.size).toBe(4);
    });

    it('generates a fresh 128-bit nonce when none is supplied', () => {
      const client = makeClient(SECRET_32);
      const a = client.buildRequest({ ...base, nonce: undefined });
      const b = client.buildRequest({ ...base, nonce: undefined });
      expect(a.signature.nonce).not.toBe(b.signature.nonce);
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

  describe('send (WebSocket transport)', () => {
    let httpServer: Server;
    let port: number;
    let fixtureHandler: (req: NodeExecRequest) => NodeExecResult | 'close' | 'malformed';

    beforeEach((done) => {
      httpServer = createServer();
      const wss = new WebSocketServer({ server: httpServer, path: '/node-exec' });
      wss.on('connection', (sock: InstanceType<typeof WebSocketServer>['_events']['connection']) => {
        sock.on('message', (data: Buffer) => {
          const req = JSON.parse(String(data)) as NodeExecRequest;
          const outcome = fixtureHandler(req);
          if (outcome === 'close') {
            sock.close();
            return;
          }
          if (outcome === 'malformed') {
            sock.send('{"not-a-result": true}');
            return;
          }
          sock.send(JSON.stringify(outcome));
        });
      });
      httpServer.listen(0, '127.0.0.1', () => {
        port = (httpServer.address() as AddressInfo).port;
        done();
      });
    });

    afterEach((done) => {
      httpServer.close(() => done());
    });

    const buildWiredClient = async (secret: string, timeoutMs = 2000) => {
      const mod: TestingModule = await Test.createTestingModule({
        providers: [
          NodeExecClient,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, fallback?: string) => {
                if (key === 'AGENT_HMAC_SECRET') return secret;
                if (key === 'AGENT_WS_URL_TEMPLATE')
                  return `ws://127.0.0.1:${port}/node-exec`;
                if (key === 'AGENT_WS_INSECURE') return 'true';
                if (key === 'AGENT_WS_TIMEOUT_MS') return String(timeoutMs);
                return fallback ?? '';
              }),
            },
          },
        ],
      }).compile();
      return mod.get(NodeExecClient);
    };

    it('refuses outbound calls when the secret is missing', async () => {
      const client = await buildWiredClient('');
      const req: NodeExecRequest = {
        commandId: 'test-mount-write',
        args: {},
        nodeId: 'node02',
        installSessionId: 'sess',
        signature: { nonce: 'x', exp: 0, hmac: 'y' },
      };
      await expect(client.send(req)).rejects.toThrow(
        /AGENT_HMAC_SECRET not configured/,
      );
    });

    it('refuses outbound calls when the secret is < 32 chars', async () => {
      const client = await buildWiredClient('tooshort');
      const req: NodeExecRequest = {
        commandId: 'test-mount-write',
        args: {},
        nodeId: 'node02',
        installSessionId: 'sess',
        signature: { nonce: 'x', exp: 0, hmac: 'y' },
      };
      await expect(client.send(req)).rejects.toThrow(
        /AGENT_HMAC_SECRET not configured/,
      );
    });

    it('roundtrips a signed request against a ws fixture', async () => {
      const client = await buildWiredClient(SECRET_32);
      fixtureHandler = (req) => {
        // Agent verifies before dispatch; test the same path.
        const v = verifyNodeExecRequest(req, SECRET_32);
        expect(v.ok).toBe(true);
        return {
          commandId: req.commandId,
          nodeId: req.nodeId,
          exitCode: 0,
          stdoutHash: 'a'.repeat(32),
          stderrHash: 'b'.repeat(32),
          durationMs: 7,
        };
      };
      const req = client.buildRequest({
        commandId: 'test-mount-write',
        args: { path: '/var/lib/swarmui/shared' },
        nodeId: '127.0.0.1', // Agent URL resolver substitutes nodeId into the template.
        installSessionId: 'sess-1',
      });
      const result = await client.send(req);
      expect(result.exitCode).toBe(0);
      expect(result.commandId).toBe('test-mount-write');
      expect(result.durationMs).toBe(7);
    });

    it('times out and rejects when the agent never responds', async () => {
      const client = await buildWiredClient(SECRET_32, 150);
      fixtureHandler = () => 'close'; // close without sending a result
      const req = client.buildRequest({
        commandId: 'test-mount-write',
        args: {},
        nodeId: '127.0.0.1',
        installSessionId: 'sess-timeout',
      });
      // Either timeout OR "closed without response" is acceptable; both
      // land as orchestrator exitCode=255 upstream.
      await expect(client.send(req)).rejects.toThrow(
        /(timeout|closed without response)/,
      );
    });

    it('rejects a malformed response', async () => {
      const client = await buildWiredClient(SECRET_32);
      fixtureHandler = () => 'malformed';
      const req = client.buildRequest({
        commandId: 'test-mount-write',
        args: {},
        nodeId: '127.0.0.1',
        installSessionId: 'sess-malformed',
      });
      await expect(client.send(req)).rejects.toThrow(/malformed response/);
    });
  });
});
