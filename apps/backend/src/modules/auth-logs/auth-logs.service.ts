import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthLog, AuthLogDocument, AuthLogEvent } from './schemas/auth-log.schema';

@Injectable()
export class AuthLogsService {
  constructor(@InjectModel(AuthLog.name) private readonly logModel: Model<AuthLogDocument>) {}

  async log(data: {
    event: AuthLogEvent;
    userId?: string;
    username?: string;
    ip?: string;
    userAgent?: string;
    details?: string;
    success?: boolean;
  }) {
    return this.logModel.create({
      ...data,
      userId: data.userId ? new Types.ObjectId(data.userId) : undefined,
    });
  }

  async findAll(page = 1, limit = 50, filters?: { event?: string; username?: string; success?: boolean }) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 50);

    const filter: any = {};
    if (filters?.event) filter.event = filters.event;
    if (filters?.username) filter.username = new RegExp(filters.username, 'i');
    if (filters?.success !== undefined) filter.success = filters.success;

    const [data, total] = await Promise.all([
      this.logModel.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
      this.logModel.countDocuments(filter),
    ]);
        return { data, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
  }
}
