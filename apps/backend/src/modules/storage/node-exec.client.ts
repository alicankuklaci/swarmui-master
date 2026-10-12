import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_EXP_WINDOW_SEC,
  HMAC_SECRET_MIN_BYTES,
  computeHmac,
  type NodeExecRequest,
  type NodeExecResult,
} from '@swarmui-master/storage-plan';

// Signs and forwards a `/node-exec` request to the swarm-agent on a specific
// node. HMAC construction is shared with the agent via
// storage-plan/hmac.ts so a drift between the two is a type error at build
// time, not a silent reject at install time.
//
// Agent URL resolution:
//   AGENT_WS_URL_TEMPLATE   wss://{nodeId}:9443/node-exec (default)
//                           Substitutes {nodeId} per step.
//   AGENT_WS_INSECURE       '1' | 'true' → use the template verbatim even if
//                           it is ws://; otherwise upgrade ws → wss.
//
// Per-call timeout: AGENT_WS_TIMEOUT_MS (default 60s). On timeout the socket
// is closed and send() rejects — the orchestrator converts that into a
// synthetic exitCode=255 result so audits and SSE stay consistent.
@Injectable()
export class NodeExecClient {
  private readonly logger = new Logger(NodeExecClient.name);
  private readonly hmacSecret: string;
  private readonly urlTemplate: string;
  private readonly timeoutMs: number;
  private readonly expWindowSec = DEFAULT_EXP_WINDOW_SEC;
  private readonly insecure: boolean;

  constructor(private readonly config: ConfigService) {
    this.hmacSecret = this.config.get<string>('AGENT_HMAC_SECRET', '');
    if (!this.hmacSecret || this.hmacSecret.length < HMAC_SECRET_MIN_BYTES) {
      // Deliberately a warn, not a throw — we want the module to boot behind
      // the feature flag even in environments that haven't configured HMAC
      // yet. send() refuses outbound calls without a strong secret.
      this.logger.warn(
        'AGENT_HMAC_SECRET missing or < 32 chars; node-exec calls will be refused until it is configured',
      );
    }
    this.urlTemplate = this.config.get<string>(
      'AGENT_WS_URL_TEMPLATE',
      'wss://{nodeId}:9443/node-exec',
    );
    this.timeoutMs = Number(this.config.get<string>('AGENT_WS_TIMEOUT_MS', '60000'));
    this.insecure =
      (this.config.get<string>('AGENT_WS_INSECURE', 'false') || 'false')
        .toLowerCase() === 'true';
    // Sprint-8 security hardening: refuse to boot with AGENT_WS_INSECURE=true
    // in production unless the operator also sets AGENT_WS_INSECURE_IN_PROD=true
    // as an explicit acknowledgement. An ops rollout that forgot to turn
    // insecure off in prod would otherwise ship over plaintext ws:// with no
    // signal to the operator.
    const nodeEnv = (this.config.get<string>('NODE_ENV', '') || '').toLowerCase();
    if (this.insecure && nodeEnv === 'production') {
      const ack = (this.config.get<string>('AGENT_WS_INSECURE_IN_PROD', '') || '').toLowerCase();
      if (ack !== 'true' && ack !== '1') {
        throw new Error(
          'AGENT_WS_INSECURE=true in production is refused. Set AGENT_WS_INSECURE_IN_PROD=true to acknowledge, or switch to wss:// (recommended).',
        );
      }
      this.logger.warn(
        'AGENT_WS_INSECURE acknowledged in production (AGENT_WS_INSECURE_IN_PROD=true). All node-exec calls will travel over plaintext ws://.',
      );
    }
  }

  // Builds a signed request. Pure, no I/O.
  buildRequest(input: {
    commandId: NodeExecRequest['commandId'];
    args: NodeExecRequest['args'];
    nodeId: string;
    installSessionId: string;
    nowSec?: number;
    nonce?: string;
  }): NodeExecRequest {
    const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
    const nonce = input.nonce ?? crypto.randomBytes(16).toString('hex');
    const exp = nowSec + this.expWindowSec;
    const hmac = computeHmac(
      {
        nonce,
        commandId: input.commandId,
        args: input.args,
        nodeId: input.nodeId,
        installSessionId: input.installSessionId,
        exp,
      },
      this.hmacSecret,
    );
    return {
      commandId: input.commandId,
      args: input.args,
      nodeId: input.nodeId,
      installSessionId: input.installSessionId,
      signature: { nonce, exp, hmac },
    };
  }

  // Opens a short-lived WebSocket to the agent, sends the signed request,
  // awaits the result or a timeout. One connection per step keeps the
  // failure modes small: a flaky agent breaks one step, not a whole batch.
  async send(request: NodeExecRequest): Promise<NodeExecResult> {
    if (!this.hmacSecret || this.hmacSecret.length < HMAC_SECRET_MIN_BYTES) {
      throw new Error('node-exec disabled: AGENT_HMAC_SECRET not configured');
    }
    const url = this.resolveUrl(request.nodeId);
    return new Promise<NodeExecResult>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      // Node 22's global WebSocket matches the browser API — one close() to
      // kill the socket, no library-specific lifecycle.
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        return reject(err);
      }
      const timer = setTimeout(() => {
        settle(() => {
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          reject(new Error(`node-exec timeout after ${this.timeoutMs}ms (${url})`));
        });
      }, this.timeoutMs);

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify(request));
        } catch (err) {
          settle(() => {
            clearTimeout(timer);
            reject(err);
          });
        }
      };
      socket.onmessage = (ev) => {
        settle(() => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(String(ev.data)) as NodeExecResult;
            // Minimum sanity — the orchestrator reads exitCode and the
            // audit layer reads the hashes. Anything missing is a protocol
            // break.
            if (
              typeof parsed.exitCode !== 'number' ||
              typeof parsed.stdoutHash !== 'string' ||
              typeof parsed.stderrHash !== 'string'
            ) {
              reject(new Error('node-exec: malformed response from agent'));
            } else {
              resolve(parsed);
            }
          } catch (err) {
            reject(err);
          } finally {
            try {
              socket.close();
            } catch {
              /* ignore */
            }
          }
        });
      };
      socket.onerror = () => {
        settle(() => {
          clearTimeout(timer);
          reject(new Error(`node-exec: connection error (${url})`));
        });
      };
      socket.onclose = () => {
        settle(() => {
          clearTimeout(timer);
          reject(new Error(`node-exec: connection closed without response (${url})`));
        });
      };
    });
  }

  private resolveUrl(nodeId: string): string {
    const base = this.urlTemplate.replace('{nodeId}', nodeId);
    if (this.insecure) return base;
    // Upgrade ws → wss unless the operator explicitly allowed plaintext.
    return base.replace(/^ws:\/\//, 'wss://');
  }
}
