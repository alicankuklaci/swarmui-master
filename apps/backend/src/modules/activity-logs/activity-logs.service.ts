import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityLog, ActivityLogDocument } from './schemas/activity-log.schema';

@Injectable()
export class ActivityLogsService {
  constructor(@InjectModel(ActivityLog.name) private readonly logModel: Model<ActivityLogDocument>) {}

  async create(data: Partial<ActivityLog>) {
    return this.logModel.create(data);
  }

  async findAll(page = 1, limit = 50, filters?: { userId?: string; action?: string }) {
    const filter: any = {};
    if (filters?.userId) filter.userId = filters.userId;
    if (filters?.action) filter.action = new RegExp(filters.action, 'i');
    const [data, total] = await Promise.all([
      this.logModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.logModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
