import { Injectable, Logger, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UptimeCheck, UptimeCheckDocument } from './schemas/uptime-check.schema';
import { AlarmRule, AlarmRuleDocument } from './schemas/alarm-rule.schema';
import { Alarm, AlarmDocument } from './schemas/alarm.schema';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { UptimeProberService } from './services/uptime-prober.service';
import { AlarmEngineService } from './services/alarm-engine.service';

@Injectable()
export class MonitoringService implements OnModuleInit {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    @InjectModel(UptimeCheck.name) private readonly uptimeModel: Model<UptimeCheckDocument>,
    @InjectModel(AlarmRule.name) private readonly ruleModel: Model<AlarmRuleDocument>,
    @InjectModel(Alarm.name) private readonly alarmModel: Model<AlarmDocument>,
    private readonly metricsCollector: MetricsCollectorService,
    private readonly uptimeProber: UptimeProberService,
    private readonly alarmEngine: AlarmEngineService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.ruleModel.countDocuments();
      if (count === 0) {
        const presets = [
          {
            name: 'Node CPU critical', description: 'Any node CPU > 90% for 5 minutes',
            target: 'node' as const, metric: 'cpu' as const, operator: '>' as const, threshold: 90,
            windowSec: 300, cooldownSec: 600, severity: 'critical' as const, enabled: false,
          },
          {
            name: 'Node RAM critical', description: 'Any node RAM > 92% for 5 minutes',
            target: 'node' as const, metric: 'mem' as const, operator: '>' as const, threshold: 92,
            windowSec: 300, cooldownSec: 600, severity: 'critical' as const, enabled: false,
          },
          {
            name: 'Node disk critical', description: 'Any disk mount > 95% full',
            target: 'node' as const, metric: 'disk' as const, operator: '>' as const, threshold: 95,
            windowSec: 300, cooldownSec: 1800, severity: 'critical' as const, enabled: false,
          },
          {
            name: 'Uptime check failed', description: 'Any enabled uptime check reports down',
            target: 'uptime' as const, metric: 'uptime' as const, operator: '==' as const, threshold: 0,
            windowSec: 30, cooldownSec: 300, severity: 'critical' as const, enabled: false,
          },
          {
            name: 'Container RAM critical', description: 'Any container RAM > 95% of its limit for 2 minutes',
            target: 'container' as const, metric: 'mem' as const, operator: '>' as const, threshold: 95,
            windowSec: 120, cooldownSec: 600, severity: 'critical' as const, enabled: false,
          },
        ];
        await this.ruleModel.insertMany(presets);
        this.logger.log(`Monitoring: ${presets.length} preset alarm rules created (disabled). Configure channels at /notifications/channels to enable.`);
      }
    } catch (err: any) {
      this.logger.warn(`Preset seed failed: ${err.message}`);
    }
  }

  // ─── uptime check CRUD ───────────────────────────────────────────────────

  async listUptimeChecks(): Promise<any[]> {
    const checks: any[] = await this.uptimeModel.find().sort({ createdAt: -1 }).lean();
    const withStats = await Promise.all(checks.map(async (c) => {
      const stats = await this.uptimeProber.successRate24h(c._id);
      return { ...c, successRate24h: stats.pct, samples24h: stats.total };
    }));
    return withStats;
  }

  async createUptimeCheck(dto: any, userId?: string) {
    if (!dto?.name) throw new BadRequestException('name required');
    if (!dto?.type) throw new BadRequestException('type required');
    if (!dto?.target) throw new BadRequestException('target required');
    const created = await this.uptimeModel.create({
      ...dto,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });
    return created;
  }

  async updateUptimeCheck(id: string, dto: any) {
    const updated = await this.uptimeModel.findByIdAndUpdate(id, dto, { new: true });
    if (!updated) throw new NotFoundException('check not found');
    return updated;
  }

  async deleteUptimeCheck(id: string) {
    const r = await this.uptimeModel.findByIdAndDelete(id);
    if (!r) throw new NotFoundException('check not found');
    return { ok: true };
  }

  async testUptimeCheck(id: string) {
    const check = await this.uptimeModel.findById(id).lean();
    if (!check) throw new NotFoundException('check not found');
    return this.uptimeProber.probeAndStore(check);
  }

  // ─── alarm rule CRUD ─────────────────────────────────────────────────────

  async listRules() {
    return this.ruleModel.find().sort({ createdAt: -1 }).lean();
  }

  async createRule(dto: any, userId?: string) {
    if (!dto?.name) throw new BadRequestException('name required');
    const created = await this.ruleModel.create({
      ...dto,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });
    return created;
  }

  async updateRule(id: string, dto: any) {
    const r = await this.ruleModel.findByIdAndUpdate(id, dto, { new: true });
    if (!r) throw new NotFoundException('rule not found');
    return r;
  }

  async deleteRule(id: string) {
    const r = await this.ruleModel.findByIdAndDelete(id);
    if (!r) throw new NotFoundException('rule not found');
    return { ok: true };
  }

  async testRule(id: string) {
    return this.alarmEngine.testFire(id);
  }

  // ─── alarms ──────────────────────────────────────────────────────────────

  async listAlarms(filters: { status?: string; severity?: string; from?: Date; to?: Date; limit?: number }) {
    const q: any = {};
    if (filters.status) q.status = filters.status;
    if (filters.severity) q.severity = filters.severity;
    if (filters.from || filters.to) {
      q.firedAt = {};
      if (filters.from) q.firedAt.$gte = filters.from;
      if (filters.to) q.firedAt.$lte = filters.to;
    }
    const limit = Math.min(500, Math.max(1, Number(filters.limit) || 100));
    return this.alarmModel.find(q).sort({ firedAt: -1 }).limit(limit).lean();
  }

  async getAlarm(id: string) {
    const a = await this.alarmModel.findById(id).lean();
    if (!a) throw new NotFoundException('alarm not found');
    return a;
  }

  async acknowledgeAlarm(id: string, userId: string) {
    const a = await this.alarmModel.findByIdAndUpdate(id, {
      acknowledgedBy: userId ? new Types.ObjectId(userId) : undefined,
      acknowledgedAt: new Date(),
    }, { new: true });
    if (!a) throw new NotFoundException('alarm not found');
    return a;
  }

  async firingCount(): Promise<number> {
    return this.alarmModel.countDocuments({ status: 'firing' });
  }
}
