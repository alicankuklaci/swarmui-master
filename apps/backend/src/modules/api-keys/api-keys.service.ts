import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyDocument, ApiKeyScope } from './api-key.schema';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectModel(ApiKey.name) private readonly apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  async generate(
    userId: string,
    name: string,
    scope: ApiKeyScope[],
    expiresAt?: Date | null,
  ): Promise<{ key: string; apiKey: ApiKeyDocument }> {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 8);

    const apiKey = await this.apiKeyModel.create({
      name,
      keyHash,
      keyPrefix,
      userId,
      scope,
      expiresAt: expiresAt || null,
    });

    return { key: rawKey, apiKey };
  }

  async validate(key: string): Promise<ApiKeyDocument | null> {
    const keyPrefix = key.substring(0, 8);
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const apiKey = await this.apiKeyModel
      .findOne({ keyPrefix, active: true })
      .select('+keyHash')
      .exec();

    if (!apiKey) return null;
    if (apiKey.keyHash !== keyHash) return null;
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null;

    await this.apiKeyModel.updateOne(
      { _id: apiKey._id },
      { lastUsedAt: new Date() },
    );

    return apiKey;
  }

  async list(userId: string): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec() as any;
  }

  async revoke(id: string): Promise<ApiKeyDocument> {
    const apiKey = await this.apiKeyModel.findByIdAndUpdate(
      id,
      { active: false },
      { new: true },
    );
    if (!apiKey) throw new NotFoundException('API key not found');
    return apiKey;
  }

  async remove(id: string): Promise<void> {
    const result = await this.apiKeyModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('API key not found');
  }
}
