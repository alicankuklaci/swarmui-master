import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { DockerService } from '../../../docker/docker.service';
import { MetricNode, MetricNodeDocument } from '../schemas/metric-node.schema';
import { MetricContainer, MetricContainerDocument } from '../schemas/metric-container.schema';
import { AgentClientService, AgentTarget } from './agent-client.service';

interface NodeMetricsResponse {
  cpu: { usagePct: number; cores: number; loadavg: number[] };
  mem: { usedBytes: number; totalBytes: number; usedPct: number };
  disk: Array<{ mount: string; usedBytes: number; totalBytes: number; usedPct: number }>;
  net: { rxBps: number; txBps: number };
  containers: { running: number; stopped: number; total: number };
  ts: string;
  hostname?: string;
}

interface ContainerMetricsResponse {
  containers: Array<{
    id: string;
    name: string;
    image: string;
    state?: string;
    stackName?: string | null;
    serviceId?: string | null;
    cpuPct: number;
    memUsedBytes: number;
    memLimitBytes: number;
    memUsedPct: number;
    netRxBytes?: number;
    netTxBytes?: number;
    blkioReadBytes?: number;
    blkioWriteBytes?: number;
    error?: string;
  }>;
  ts: string;
}

/**
 * Pulls metrics from each swarmui-agent at a fixed interval and persists
 * them to Mongo. Container bytes-since-start values are differentiated here
 * (per-container, keyed by `nodeId:containerId`) into per-second rates.
 */
@Injectable()
export class MetricsCollectorService {
  private readonly logger = new Logger(MetricsCollectorService.name);
  private readonly agentPort: number;
  private readonly agentToken: string;
  private readonly agentHostOverride?: string;
  private lastContainerSample = new Map<string, { ts: number; rx: number; tx: number; r: number; w: number }>();

  constructor(
    @InjectModel(MetricNode.name) private readonly nodeModel: Model<MetricNodeDocument>,
    @InjectModel(MetricContainer.name) private readonly containerModel: Model<MetricContainerDocument>,
    private readonly docker: DockerService,
    private readonly agent: AgentClientService,
    private readonly config: ConfigService,
  ) {
    this.agentPort = Number(this.config.get('AGENT_PORT', '9001'));
    this.agentToken = this.config.get<string>('AGENT_TOKEN', '') || '';
    this.agentHostOverride = this.config.get<string>('AGENT_HOST_OVERRIDE') || undefined;
  }

  /**
   * Discovers agent targets. Each docker swarm node becomes a target reachable
   * at <hostname>:<agentPort> on the overlay net (where tasks.swarmui-agent
   * resolves to all replicas). An env override `AGENT_HOST_OVERRIDE` lets you
   * pin a single host for dev.
   */
  async targets(): Promise<AgentTarget[]> {
    if (this.agentHostOverride) {
      return [{ nodeId: 'local', host: this.agentHostOverride, port: this.agentPort, token: this.agentToken }];
    }
    try {
      const dockerode = this.docker.getLocalConnection();
      const nodes = await dockerode.listNodes();
      const out: AgentTarget[] = [];
      for (const n of nodes) {
        const nodeId = n.ID;
        // Prefer the swarm advertised address; manager leaders often report
        // Status.Addr as "0.0.0.0" so fall back to ManagerStatus.Addr for them.
        const statusAddr = n.Status?.Addr;
        const mgrAddr = (n as any).ManagerStatus?.Addr?.split(':')[0];
        const addr =
          (statusAddr && statusAddr !== '0.0.0.0' ? statusAddr : null) ||
          (mgrAddr && mgrAddr !== '0.0.0.0' ? mgrAddr : null) ||
          n.Description?.Hostname;
        if (!nodeId || !addr) continue;
        out.push({
          nodeId,
          host: addr,
          port: this.agentPort,
          token: this.agentToken,
          hostname: n.Description?.Hostname,
        });
      }
      return out;
    } catch (err: any) {
      this.logger.warn(`listNodes failed, falling back to local tasks dns: ${err.message}`);
      return [{ nodeId: 'local', host: 'tasks.swarmui-agent', port: this.agentPort, token: this.agentToken }];
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'metrics-node' })
  async collectNodeMetrics() {
    const targets = await this.targets();
    await Promise.all(targets.map(async (t) => {
      try {
        const resp = await this.agent.fetchJson<NodeMetricsResponse>(t, '/metrics/node');
        // Prefer swarm-advertised hostname (t.hostname) over agent-reported one.
        const hostname = t.hostname || resp.hostname;
        await this.nodeModel.create({
          nodeId: t.nodeId,
          nodeHostname: hostname,
          ts: new Date(resp.ts || Date.now()),
          cpu: resp.cpu,
          mem: resp.mem,
          disk: resp.disk,
          net: resp.net,
          containers: resp.containers,
        });
      } catch (err: any) {
        this.logger.debug(`node metrics failed for ${t.nodeId}: ${err.message}`);
      }
    }));
  }

  /**
   * Live map of docker nodeId → hostname. Lets controllers decorate old samples
   * (which lack `nodeHostname`) and keep display names current.
   */
  async nodeIdToHostname(): Promise<Record<string, string>> {
    try {
      const dockerode = this.docker.getLocalConnection();
      const nodes = await dockerode.listNodes();
      const map: Record<string, string> = {};
      for (const n of nodes) {
        if (n.ID && n.Description?.Hostname) map[n.ID] = n.Description.Hostname;
      }
      return map;
    } catch {
      return {};
    }
  }

  // We want 30s container sampling. CronExpression.EVERY_30_SECONDS fires both
  // collectors; we offset the container poll by a small jitter via setTimeout
  // inside its body to avoid Docker socket pressure spikes.
  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'metrics-containers' })
  async collectContainerMetrics() {
    await new Promise((r) => setTimeout(r, 2000)); // small offset vs node collector
    const targets = await this.targets();
    await Promise.all(targets.map(async (t) => {
      try {
        const resp = await this.agent.fetchJson<ContainerMetricsResponse>(t, '/metrics/containers', 20_000);
        const ts = new Date(resp.ts || Date.now());
        const docs = resp.containers
          .filter((c) => !c.error)
          .map((c) => {
            const key = `${t.nodeId}:${c.id}`;
            const prev = this.lastContainerSample.get(key);
            const now = ts.getTime();
            let netRxBps = 0, netTxBps = 0, blkioReadBps = 0, blkioWriteBps = 0;
            if (prev) {
              const dt = Math.max(1, (now - prev.ts) / 1000);
              netRxBps = Math.max(0, ((c.netRxBytes || 0) - prev.rx) / dt);
              netTxBps = Math.max(0, ((c.netTxBytes || 0) - prev.tx) / dt);
              blkioReadBps = Math.max(0, ((c.blkioReadBytes || 0) - prev.r) / dt);
              blkioWriteBps = Math.max(0, ((c.blkioWriteBytes || 0) - prev.w) / dt);
            }
            this.lastContainerSample.set(key, {
              ts: now,
              rx: c.netRxBytes || 0,
              tx: c.netTxBytes || 0,
              r: c.blkioReadBytes || 0,
              w: c.blkioWriteBytes || 0,
            });
            return {
              nodeId: t.nodeId,
              containerId: c.id,
              name: c.name || '',
              image: c.image || '',
              stackName: c.stackName || undefined,
              serviceId: c.serviceId || undefined,
              ts,
              cpuPct: c.cpuPct || 0,
              memUsedBytes: c.memUsedBytes || 0,
              memLimitBytes: c.memLimitBytes || 0,
              memUsedPct: c.memUsedPct || 0,
              netRxBps, netTxBps, blkioReadBps, blkioWriteBps,
            };
          });
        if (docs.length) await this.containerModel.insertMany(docs, { ordered: false });
      } catch (err: any) {
        this.logger.debug(`container metrics failed for ${t.nodeId}: ${err.message}`);
      }
    }));
  }

  // ─── read helpers ────────────────────────────────────────────────────────

  async latestNodeSamples() {
    const nodes = await this.nodeModel.aggregate([
      { $sort: { ts: -1 } },
      { $group: { _id: '$nodeId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { nodeId: 1 } },
    ]);
    return nodes;
  }

  async nodeSeries(nodeId: string, from: Date, to: Date) {
    return this.nodeModel.find({ nodeId, ts: { $gte: from, $lte: to } })
      .sort({ ts: 1 }).lean();
  }

  async latestContainers(opts: { nodeId?: string; sort?: 'cpu' | 'mem'; limit?: number } = {}) {
    const match: any = {};
    if (opts.nodeId) match.nodeId = opts.nodeId;
    // Latest sample per containerId.
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
    const sortField = opts.sort === 'mem' ? 'memUsedPct' : 'cpuPct';
    const samples = await this.containerModel.aggregate([
      { $match: match },
      { $sort: { ts: -1 } },
      { $group: { _id: '$containerId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { [sortField]: -1 } },
      { $limit: limit },
    ]);
    return samples;
  }

  async containerSeries(containerId: string, from: Date, to: Date) {
    return this.containerModel.find({ containerId, ts: { $gte: from, $lte: to } })
      .sort({ ts: 1 }).lean();
  }
}
