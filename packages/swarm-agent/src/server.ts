import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  verifyNodeExecRequest,
  type NodeExecRequest,
} from '@swarmui-master/storage-plan';
import { defaultHandlerMap, dispatch } from './dispatcher';
import type { HandlerMap } from './handlers/types';

// WebSocket agent. Accepts one request per connection, verifies HMAC, hands
// off to the dispatcher, writes the response, closes. TLS is handled by a
// reverse proxy (nginx / caddy) in prod; this process stays HTTP so a test
// can boot it on an ephemeral port with no cert machinery.

export interface AgentOptions {
  // HMAC secret. 32-byte minimum enforced by verifyNodeExecRequest.
  hmacSecret: string;
  // Port to bind. 0 picks an ephemeral port — the resolved port is on
  // AgentHandle.port after start().
  port?: number;
  // Interface. Default '0.0.0.0'; tests use '127.0.0.1'.
  host?: string;
  // Path. Default '/node-exec'. Must match the backend's URL template.
  path?: string;
  // Optional handler overrides. Unlisted commands fall back to the NOOP
  // handler (Sprint 2); Sprint 3 replaces entries with the real installers.
  handlers?: HandlerMap;
  // Receives one line per request, pre-handler. Agents in prod log to
  // syslog; tests pass a jest.fn to assert dispatch flow.
  onAudit?: (entry: AgentAuditEntry) => void;
}

export interface AgentAuditEntry {
  ts: string;
  commandId: string;
  nodeId: string;
  installSessionId: string;
  verdict: ReturnType<typeof verifyNodeExecRequest>['reason'];
}

export interface AgentHandle {
  port: number;
  close: () => Promise<void>;
}

export async function startAgent(opts: AgentOptions): Promise<AgentHandle> {
  const path = opts.path ?? '/node-exec';
  const handlers = { ...defaultHandlerMap(), ...(opts.handlers ?? {}) };

  const http = createServer();
  const wss = new WebSocketServer({ server: http, path });

  wss.on('connection', (sock: WebSocket) => {
    // One message per connection — nothing stateful survives across a step.
    sock.once('message', async (data: Buffer) => {
      let request: NodeExecRequest;
      try {
        request = JSON.parse(String(data));
      } catch {
        safeSend(sock, {
          commandId: 'test-mount-write' as NodeExecRequest['commandId'],
          nodeId: 'unknown',
          exitCode: 1,
          stdoutHash: '',
          stderrHash: '',
          stderrTail: 'invalid JSON envelope',
          durationMs: 0,
        });
        sock.close();
        return;
      }
      const verdict = verifyNodeExecRequest(request, opts.hmacSecret);
      opts.onAudit?.({
        ts: new Date().toISOString(),
        commandId: request.commandId ?? 'unknown',
        nodeId: request.nodeId ?? 'unknown',
        installSessionId: request.installSessionId ?? 'unknown',
        verdict: verdict.reason,
      });
      if (!verdict.ok) {
        // Reject without executing. The response still conforms to
        // NodeExecResult so the backend can audit it; exitCode=126 is the
        // classic "permission denied" code and separates auth rejects from
        // command-level failures.
        safeSend(sock, {
          commandId: request.commandId,
          nodeId: request.nodeId,
          exitCode: 126,
          stdoutHash: '',
          stderrHash: '',
          stderrTail: `hmac reject: ${verdict.reason}`,
          durationMs: 0,
        });
        sock.close();
        return;
      }
      const result = await dispatch(request, handlers);
      safeSend(sock, result);
      sock.close();
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port ?? 0, opts.host ?? '0.0.0.0', () => resolve());
  });

  const addr = http.address();
  const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 0);

  return {
    port,
    close: async () => {
      wss.clients.forEach((c) => {
        try {
          c.terminate();
        } catch {
          /* ignore */
        }
      });
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) =>
        (http as HttpServer).close(() => resolve()),
      );
    },
  };
}

function safeSend(sock: WebSocket, payload: unknown): void {
  try {
    sock.send(JSON.stringify(payload));
  } catch {
    /* client already gone */
  }
}
