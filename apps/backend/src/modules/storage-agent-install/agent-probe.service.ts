import * as net from 'node:net';
import { Injectable, Logger } from '@nestjs/common';
import { DockerService } from '../../docker/docker.service';

// Simple TCP reachability probe for the swarm-agent's :9443 WebSocket port.
// We don't do a full HMAC handshake here — the UI poll loop just needs to
// know "did an operator paste the installer yet", and a bound tcp port is
// the right proxy for that. A sub-200ms open-and-close socket is light
// enough to run on every 2-second poll tick without worrying about
// hammering any node.

const DEFAULT_PORT = 9443;
const DEFAULT_TIMEOUT_MS = 2_000;

export interface AgentProbeResult {
  nodeId: string;
  up: boolean;
  latencyMs?: number;
  error?: string;
}

@Injectable()
export class AgentProbeService {
  private readonly logger = new Logger(AgentProbeService.name);

  constructor(private readonly docker: DockerService) {}

  async probe(nodeId: string): Promise<AgentProbeResult> {
    const start = Date.now();
    return new Promise<AgentProbeResult>((resolve) => {
      const sock = new net.Socket();
      let settled = false;
      const settle = (result: AgentProbeResult): void => {
        if (settled) return;
        settled = true;
        try {
          sock.destroy();
        } catch {
          /* ignore */
        }
        resolve(result);
      };
      sock.setTimeout(DEFAULT_TIMEOUT_MS);
      sock.once('connect', () =>
        settle({ nodeId, up: true, latencyMs: Date.now() - start }),
      );
      sock.once('error', (err) =>
        settle({ nodeId, up: false, error: err.message }),
      );
      sock.once('timeout', () =>
        settle({ nodeId, up: false, error: 'timeout' }),
      );
      sock.connect(DEFAULT_PORT, nodeId);
    });
  }

  async probeMany(nodeIds: string[]): Promise<AgentProbeResult[]> {
    return Promise.all(nodeIds.map((id) => this.probe(id)));
  }

  // Lists the hostnames of every node in the local swarm. The install wizard
  // pre-fills this so the operator doesn't type node names by hand. Falls
  // back to an empty list when the socket is unreachable — the UI then
  // asks the operator to type nodes manually.
  async listSwarmNodes(): Promise<Array<{ nodeId: string; role: string; availability: string }>> {
    try {
      const docker = this.docker.getLocalConnection();
      const nodes: any[] = await (docker as any).listNodes();
      return nodes
        .map((n) => ({
          nodeId: n?.Description?.Hostname ?? '',
          role: n?.Spec?.Role ?? 'worker',
          availability: n?.Spec?.Availability ?? 'active',
        }))
        .filter((n) => n.nodeId.length > 0);
    } catch (err) {
      this.logger.warn(
        `listSwarmNodes failed: ${(err as Error).message}; UI will ask operator for manual entry`,
      );
      return [];
    }
  }
}
