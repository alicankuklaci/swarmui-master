import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetricContainer, MetricContainerDocument } from '../schemas/metric-container.schema';
import { MetricNode, MetricNodeDocument } from '../schemas/metric-node.schema';

@Injectable()
export class SnapshotService {
  constructor(
    @InjectModel(MetricContainer.name) private readonly containerModel: Model<MetricContainerDocument>,
    @InjectModel(MetricNode.name) private readonly nodeModel: Model<MetricNodeDocument>,
  ) {}

  async build(target: { nodeId?: string; containerId?: string }) {
    const snapshot: any = { topContainersCpu: [], topContainersMem: [], nodeState: undefined };
    if (target.nodeId) {
      const latestNode = await this.nodeModel.findOne({ nodeId: target.nodeId }).sort({ ts: -1 }).lean();
      if (latestNode) {
        const maxDisk = Math.max(0, ...(latestNode.disk || []).map((d: any) => d.usedPct));
        snapshot.nodeState = {
          cpuPct: latestNode.cpu?.usagePct || 0,
          memUsedPct: latestNode.mem?.usedPct || 0,
          diskUsedPct: maxDisk,
        };
      }
      const topCpu = await this.topBy(target.nodeId, 'cpuPct');
      const topMem = await this.topBy(target.nodeId, 'memUsedPct');
      snapshot.topContainersCpu = topCpu;
      snapshot.topContainersMem = topMem;
    }
    return snapshot;
  }

  private async topBy(nodeId: string, field: 'cpuPct' | 'memUsedPct') {
    const docs = await this.containerModel.aggregate([
      { $match: { nodeId } },
      { $sort: { ts: -1 } },
      { $group: { _id: '$containerId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { [field]: -1 } },
      { $limit: 5 },
    ]);
    return docs.map((d: any) => ({
      name: d.name,
      cpuPct: d.cpuPct || 0,
      memUsedPct: d.memUsedPct || 0,
    }));
  }
}
