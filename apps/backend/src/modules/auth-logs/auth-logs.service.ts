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
    const filter: any = {};
    if (filters?.event) filter.event = filters.event;
    if (filters?.username) filter.username = new RegExp(filters.username, 'i');
    if (filters?.success !== undefined) filter.success = filters.success;

    const [data, total] = await Promise.all([
      this.logModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.logModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
