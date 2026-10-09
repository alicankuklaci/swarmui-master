import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import {
  NotificationChannel, NotificationChannelDocument, ChannelType,
} from './schemas/notification-channel.schema';
import {
  NotificationLog, NotificationLogDocument,
} from './schemas/notification-log.schema';
import { ChannelRegistryService } from './channel-registry.service';
import { encrypt, decrypt } from '../../common/utils/crypto.util';
import { AlarmPayload, SnapshotPayload, ChannelResult } from './channels/channel.interface';

export interface CreateChannelDto {
  name: string;
  type: ChannelType;
  config: Record<string, any>;
  enabled?: boolean;
}

export interface UpdateChannelDto {
  name?: string;
  config?: Record<string, any>;
  enabled?: boolean;
}

@Injectable()
export class NotificationChannelsService {
  private readonly logger = new Logger(NotificationChannelsService.name);
  private readonly secret: string;

  constructor(
    @InjectModel(NotificationChannel.name) private readonly channelModel: Model<NotificationChannelDocument>,
    @InjectModel(NotificationLog.name) private readonly logModel: Model<NotificationLogDocument>,
    private readonly config: ConfigService,
    private readonly registry: ChannelRegistryService,
  ) {
    this.secret = this.config.get<string>('ENCRYPTION_SECRET', 'swarmui-secret-key');
  }

  async findAll() {
    const channels = await this.channelModel.find().sort({ createdAt: -1 }).lean();
    return channels.map((c) => this.toMasked(c));
  }

  async findOneRaw(id: string) {
    const c = await this.channelModel.findById(id);
    if (!c) throw new NotFoundException('Channel not found');
    return c;
  }

  async findOne(id: string) {
    const c = await this.findOneRaw(id);
    return this.toMasked(c.toObject());
  }

  async create(dto: CreateChannelDto, userId?: string) {
    if (!dto?.name) throw new BadRequestException('name required');
    if (!dto?.type) throw new BadRequestException('type required');
    const normalized = this.normalizeConfig(dto.type, dto.config || {});
    this.registry.validate(dto.type, normalized);
    const configEncrypted = encrypt(JSON.stringify(normalized), this.secret);
    const created = await this.channelModel.create({
      name: dto.name,
      type: dto.type,
      configEncrypted,
      enabled: dto.enabled ?? true,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });
    return this.toMasked(created.toObject());
  }

  async update(id: string, dto: UpdateChannelDto) {
    const c = await this.findOneRaw(id);
    if (dto.name !== undefined) c.name = dto.name;
    if (dto.enabled !== undefined) c.enabled = dto.enabled;
    if (dto.config !== undefined) {
      // Merge new config with existing (so partial updates preserve password).
      const existing = this.decryptConfig(c);
      const merged = { ...existing, ...this.normalizeConfig(c.type, dto.config) };
      this.registry.validate(c.type, merged);
      c.configEncrypted = encrypt(JSON.stringify(merged), this.secret);
    }
    await c.save();
    return this.toMasked(c.toObject());
  }

  async delete(id: string) {
    const r = await this.channelModel.findByIdAndDelete(id);
    if (!r) throw new NotFoundException('Channel not found');
    return { ok: true };
  }

  async test(id: string): Promise<{ success: boolean; error?: string }> {
    const c = await this.findOneRaw(id);
    const config = this.decryptConfig(c);
    const adapter = this.registry.get(c.type);
    const started = Date.now();
    const result = await adapter.test(config);
    const latencyMs = Date.now() - started;

    c.lastTestResult = { ts: new Date(), success: result.success, error: result.error };
    await c.save();

    await this.logModel.create({
      channelId: c._id,
      channelName: c.name,
      channelType: c.type,
      ts: new Date(),
      success: result.success,
      error: result.error,
      latencyMs,
    });
    return result;
  }

  /** Low-level send — used by the alarm engine. */
  async send(id: string | Types.ObjectId, alarm: AlarmPayload, snapshot: SnapshotPayload, alarmId?: Types.ObjectId): Promise<ChannelResult> {
    const c = await this.channelModel.findById(id);
    if (!c) {
      return { success: false, error: 'channel not found', latencyMs: 0 };
    }
    if (!c.enabled) {
      return { success: false, error: 'channel disabled', latencyMs: 0 };
    }
    const config = this.decryptConfig(c);
    const adapter = this.registry.get(c.type);
    const result = await adapter.send(alarm, snapshot, config);
    await this.logModel.create({
      channelId: c._id,
      channelName: c.name,
      channelType: c.type,
      alarmId,
      ts: new Date(),
      success: result.success,
      error: result.error,
      latencyMs: result.latencyMs,
    });
    return result;
  }

  types() {
    return this.registry.types();
  }

  async logs(filters: { channelId?: string; limit?: number } = {}) {
    const q: any = {};
    if (filters.channelId) q.channelId = new Types.ObjectId(filters.channelId);
    const limit = Math.min(500, Math.max(1, Number(filters.limit) || 100));
    return this.logModel.find(q).sort({ ts: -1 }).limit(limit).lean();
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private decryptConfig(c: NotificationChannelDocument): any {
    try {
      return JSON.parse(decrypt(c.configEncrypted, this.secret));
    } catch (err: any) {
      this.logger.error(`decrypt failed for channel ${c._id}: ${err.message}`);
      throw new BadRequestException('channel config could not be decrypted');
    }
  }

  private toMasked(doc: any): any {
    let masked: Record<string, any> = {};
    try {
      const cfg = JSON.parse(decrypt(doc.configEncrypted, this.secret));
      masked = this.registry.mask(doc.type, cfg);
    } catch {
      masked = { type: doc.type, _error: 'decrypt failed' };
    }
    return {
      _id: doc._id,
      name: doc.name,
      type: doc.type,
      enabled: doc.enabled,
      lastTestResult: doc.lastTestResult,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      configMasked: masked,
    };
  }

  private normalizeConfig(type: ChannelType, config: Record<string, any>): Record<string, any> {
    const out = { ...config };
    if (type === 'email') {
      if (typeof out.to === 'string') {
        out.to = out.to.split(/[,\n;]+/).map((s: string) => s.trim()).filter(Boolean);
      }
      out.smtpPort = Number(out.smtpPort) || 587;
      if (typeof out.smtpSecure === 'string') out.smtpSecure = out.smtpSecure === 'true';
    }
    if (type === 'webhook' && typeof out.headers === 'string') {
      try { out.headers = JSON.parse(out.headers); } catch { out.headers = {}; }
    }
    return out;
  }
}
