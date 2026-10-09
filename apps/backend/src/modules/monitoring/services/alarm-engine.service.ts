import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { AlarmRule, AlarmRuleDocument } from '../schemas/alarm-rule.schema';
import { Alarm, AlarmDocument } from '../schemas/alarm.schema';
import { MetricNode, MetricNodeDocument } from '../schemas/metric-node.schema';
import { MetricContainer, MetricContainerDocument } from '../schemas/metric-container.schema';
import { UptimeCheck, UptimeCheckDocument } from '../schemas/uptime-check.schema';
import { SnapshotService } from './snapshot.service';
import { NotificationChannelsService } from '../../notifications/notification-channels.service';
import { AlarmPayload } from '../../notifications/channels/channel.interface';

@Injectable()
export class AlarmEngineService {
  private readonly logger = new Logger(AlarmEngineService.name);

  constructor(
    @InjectModel(AlarmRule.name) private readonly ruleModel: Model<AlarmRuleDocument>,
    @InjectModel(Alarm.name) private readonly alarmModel: Model<AlarmDocument>,
    @InjectModel(MetricNode.name) private readonly nodeModel: Model<MetricNodeDocument>,
    @InjectModel(MetricContainer.name) private readonly containerModel: Model<MetricContainerDocument>,
    @InjectModel(UptimeCheck.name) private readonly uptimeModel: Model<UptimeCheckDocument>,
    private readonly snapshot: SnapshotService,
    private readonly channels: NotificationChannelsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'alarm-engine' })
  async evaluateAll() {
    const rules = await this.ruleModel.find({ enabled: true });
    for (const rule of rules) {
      try { await this.evaluateRule(rule); }
      catch (err: any) { this.logger.warn(`rule ${rule.name} eval failed: ${err.message}`); }
    }
  }

  // Event listener — uptime state changes trigger immediate rule evaluation.
  @OnEvent('uptime.changed')
  async onUptimeChanged() {
    const rules = await this.ruleModel.find({ enabled: true, metric: 'uptime' });
    for (const r of rules) await this.evaluateRule(r);
  }

  private async evaluateRule(rule: AlarmRuleDocument) {
    const now = new Date();
    const evaluation = await this.sample(rule);
    rule.lastEvaluatedAt = now;

    // Determine if the condition is currently satisfied for the full window.
    const satisfied = evaluation.breached;

    if (satisfied) {
      if (rule.state !== 'firing') {
        if (rule.state !== 'pending') {
          rule.state = 'pending';
          rule.pendingSince = now;
        }
        // Window must have elapsed since pendingSince AND cooldown respected.
        const pendingAge = (now.getTime() - (rule.pendingSince?.getTime() || now.getTime())) / 1000;
        const cooldownOk = !rule.lastFiredAt || (now.getTime() - rule.lastFiredAt.getTime()) / 1000 >= rule.cooldownSec;
        if (pendingAge >= rule.windowSec && cooldownOk) {
          await this.fire(rule, evaluation);
        }
      }
    } else {
      // Not satisfied.
      if (rule.state === 'firing' && rule.currentAlarmId) {
        await this.resolve(rule, evaluation);
      }
      rule.state = 'ok';
      rule.pendingSince = undefined;
    }
    await rule.save();
  }

  private async sample(rule: AlarmRuleDocument): Promise<{ breached: boolean; value: number; target: any }> {
    const windowFrom = new Date(Date.now() - rule.windowSec * 1000);
    const filter = rule.targetFilter || {};
    const target: any = {};

    if (rule.target === 'node') {
      const q: any = { ts: { $gte: windowFrom } };
      if (filter.nodeId) q.nodeId = filter.nodeId;
      const samples = await this.nodeModel.find(q).lean();
      if (!samples.length) return { breached: false, value: 0, target };
      const values = samples.map((s) => this.extractNodeMetric(s, rule.metric));
      // Every sample in window must satisfy the operator.
      const allBreach = values.every((v) => this.cmp(v, rule.operator, rule.threshold));
      const value = this.summarizeNode(values, rule.operator);
      target.nodeId = filter.nodeId || samples[samples.length - 1].nodeId;
      return { breached: allBreach, value, target };
    }

    if (rule.target === 'container' || rule.target === 'stack') {
      const q: any = { ts: { $gte: windowFrom } };
      if (filter.nodeId) q.nodeId = filter.nodeId;
      if (filter.containerName) q.name = { $regex: filter.containerName };
      if (filter.stackName) q.stackName = filter.stackName;
      const samples = await this.containerModel.find(q).lean();
      if (!samples.length) return { breached: false, value: 0, target };
      // Group by containerId; alarm fires if ANY container breached every sample.
      const groups = new Map<string, number[]>();
      for (const s of samples) {
        const key = s.containerId;
        const arr = groups.get(key) || [];
        arr.push(this.extractContainerMetric(s, rule.metric));
        groups.set(key, arr);
      }
      let worstValue = -Infinity;
      let worstKey: string | undefined;
      let breached = false;
      for (const [key, vals] of groups.entries()) {
        if (vals.every((v) => this.cmp(v, rule.operator, rule.threshold))) {
          const peak = Math.max(...vals);
          if (peak > worstValue) { worstValue = peak; worstKey = key; }
          breached = true;
        }
      }
      if (!breached) return { breached: false, value: 0, target };
      target.containerId = worstKey;
      const anySample = samples.find((s) => s.containerId === worstKey);
      if (anySample) {
        target.nodeId = anySample.nodeId;
        target.stackName = anySample.stackName;
      }
      return { breached: true, value: worstValue, target };
    }

    if (rule.target === 'uptime') {
      const q: any = {};
      if (filter.uptimeCheckId) q._id = new Types.ObjectId(String(filter.uptimeCheckId));
      const checks = await this.uptimeModel.find(q).lean();
      // For an uptime rule, metric=uptime, threshold is irrelevant — treat "down" as breach.
      for (const c of checks) {
        if (c.lastStatus === 'down') {
          target.uptimeCheckId = c._id;
          return { breached: true, value: 0, target };
        }
      }
      return { breached: false, value: 1, target };
    }

    return { breached: false, value: 0, target };
  }

  private extractNodeMetric(s: any, metric: string): number {
    if (metric === 'cpu') return s.cpu?.usagePct || 0;
    if (metric === 'mem') return s.mem?.usedPct || 0;
    if (metric === 'disk') return Math.max(0, ...((s.disk || []).map((d: any) => d.usedPct)));
    if (metric === 'containerCount') return s.containers?.running || 0;
    return 0;
  }

  private extractContainerMetric(s: any, metric: string): number {
    if (metric === 'cpu') return s.cpuPct || 0;
    if (metric === 'mem') return s.memUsedPct || 0;
    return 0;
  }

  private summarizeNode(values: number[], op: string): number {
    if (op.startsWith('>')) return Math.max(...values);
    if (op.startsWith('<')) return Math.min(...values);
    return values[values.length - 1];
  }

  private cmp(v: number, op: string, t: number): boolean {
    switch (op) {
      case '>': return v > t;
      case '>=': return v >= t;
      case '<': return v < t;
      case '<=': return v <= t;
      case '==': return v === t;
      default: return false;
    }
  }

  private async fire(rule: AlarmRuleDocument, ev: { value: number; target: any }) {
    const snap = await this.snapshot.build(ev.target || {});
    const alarm = await this.alarmModel.create({
      ruleId: rule._id,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      firedAt: new Date(),
      value: ev.value,
      threshold: rule.threshold,
      target: ev.target,
      snapshot: snap,
      notifiedChannels: [],
    });
    rule.state = 'firing';
    rule.lastFiredAt = alarm.firedAt;
    rule.currentAlarmId = alarm._id as Types.ObjectId;

    const payload: AlarmPayload = {
      id: String(alarm._id),
      ruleName: alarm.ruleName,
      severity: alarm.severity,
      status: 'firing',
      value: alarm.value,
      threshold: alarm.threshold,
      firedAt: alarm.firedAt,
      target: {
        nodeId: ev.target?.nodeId,
        containerId: ev.target?.containerId,
        stackName: ev.target?.stackName,
        uptimeCheckId: ev.target?.uptimeCheckId ? String(ev.target.uptimeCheckId) : undefined,
      },
    };
    await this.notify(rule, payload, snap, alarm._id as Types.ObjectId);
  }

  private async resolve(rule: AlarmRuleDocument, ev: { value: number; target: any }) {
    if (!rule.currentAlarmId) return;
    const alarm = await this.alarmModel.findById(rule.currentAlarmId);
    if (!alarm) { rule.currentAlarmId = undefined; return; }
    alarm.status = 'resolved';
    alarm.resolvedAt = new Date();
    await alarm.save();

    const payload: AlarmPayload = {
      id: String(alarm._id),
      ruleName: alarm.ruleName,
      severity: alarm.severity,
      status: 'resolved',
      value: ev.value,
      threshold: alarm.threshold,
      firedAt: alarm.firedAt,
      resolvedAt: alarm.resolvedAt,
      target: {
        nodeId: alarm.target?.nodeId,
        containerId: alarm.target?.containerId,
        stackName: alarm.target?.stackName,
        uptimeCheckId: alarm.target?.uptimeCheckId ? String(alarm.target.uptimeCheckId) : undefined,
      },
    };
    const snap = alarm.snapshot as any || {};
    await this.notify(rule, payload, snap, alarm._id as Types.ObjectId);
    rule.currentAlarmId = undefined;
  }

  private async notify(rule: AlarmRuleDocument, payload: AlarmPayload, snapshot: any, alarmId: Types.ObjectId) {
    const notifiedChannels: any[] = [];
    for (const chId of rule.channelIds || []) {
      try {
        const r = await this.channels.send(chId, payload, snapshot, alarmId);
        notifiedChannels.push({
          channelId: chId, channelType: (r as any).type || '',
          success: r.success, error: r.error, at: new Date(),
        });
      } catch (err: any) {
        notifiedChannels.push({
          channelId: chId, channelType: '',
          success: false, error: err.message, at: new Date(),
        });
      }
    }
    if (notifiedChannels.length) {
      await this.alarmModel.updateOne({ _id: alarmId }, {
        $push: { notifiedChannels: { $each: notifiedChannels } },
      });
    }
  }

  /** Called from controller to fire a one-off test alarm for a rule. */
  async testFire(ruleId: string) {
    const rule = await this.ruleModel.findById(ruleId);
    if (!rule) throw new Error('rule not found');
    const payload: AlarmPayload = {
      id: 'test',
      ruleName: `[TEST] ${rule.name}`,
      severity: rule.severity,
      status: 'firing',
      value: rule.threshold + 1,
      threshold: rule.threshold,
      firedAt: new Date(),
      target: {},
    };
    const snap = { topContainersCpu: [], topContainersMem: [] };
    const results: any[] = [];
    for (const chId of rule.channelIds || []) {
      results.push(await this.channels.send(chId, payload, snap));
    }
    return { results };
  }
}
