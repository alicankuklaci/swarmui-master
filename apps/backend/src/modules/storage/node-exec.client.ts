import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  NodeExecRequest,
  NodeExecResult,
} from '@swarmui-master/storage-plan';

// Signs and forwards a /node-exec request to the swarm-agent on a specific
// node. v1 is a stub — the actual WebSocket client lands in Sprint 3 alongside
// the SeaweedFS installer. The HMAC construction below is final though; the
// agent side will re-compute and verify the same inputs.
//
// HMAC input (canonical order, newline-separated, no trailing newline):
//   nonce
//   commandId
//   sha256(JSON.stringify(args))  // hex
//   nodeId
//   installSessionId
//   exp
//
// Secret: AGENT_HMAC_SECRET env var; must be ≥ 32 bytes. Separate from
// AGENT_TOKEN so a legacy token leak doesn't forge new installs.
@Injectable()
export class NodeExecClient {
  private readonly logger = new Logger(NodeExecClient.name);
  private readonly hmacSecret: string;
  private readonly expWindowSec = 300; // 5 min

  constructor(private readonly config: ConfigService) {
    this.hmacSecret = this.config.get<string>('AGENT_HMAC_SECRET', '');
    if (!this.hmacSecret || this.hmacSecret.length < 32) {
      // Deliberately a warn, not a throw — we want the module to boot behind
      // the feature flag even in environments that haven't configured HMAC
      // yet. send() refuses outbound calls without a strong secret.
      this.logger.warn(
        'AGENT_HMAC_SECRET missing or < 32 chars; node-exec calls will be refused until it is configured',
      );
    }
  }

  // Builds a signed request. Pure, no I/O — useful for the agent-side tests
  // that need to replay the same signature.
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
    const argvHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(input.args))
      .digest('hex');
    const canonical = [
      nonce,
      input.commandId,
      argvHash,
      input.nodeId,
      input.installSessionId,
      String(exp),
    ].join('\n');
    const hmac = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(canonical)
      .digest('hex');
    return {
      commandId: input.commandId,
      args: input.args,
      nodeId: input.nodeId,
      installSessionId: input.installSessionId,
      signature: { nonce, exp, hmac },
    };
  }

  // Stub: the real WebSocket round-trip lands in Sprint 3. Here only so the
  // state machine and installer can be exercised in integration tests with a
  // test double (replace this provider with an in-memory mock).
  async send(_request: NodeExecRequest): Promise<NodeExecResult> {
    if (!this.hmacSecret || this.hmacSecret.length < 32) {
      throw new Error('node-exec disabled: AGENT_HMAC_SECRET not configured');
    }
    throw new Error('node-exec client not implemented (Sprint 3)');
  }
}
