import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, NotificationLevel } from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(data: {
    title: string;
    message: string;
    level?: NotificationLevel;
    userId?: string;
    global?: boolean;
    resourceType?: string;
    resourceId?: string;
    link?: string;
  }) {
    return this.notificationModel.create({
      ...data,
      userId: data.userId ? new Types.ObjectId(data.userId) : undefined,
    });
  }

  async findForUser(userId: string, page = 1, limit = 50) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 50);
    const skip = (safePage - 1) * safeLimit;
    const query = {
      $or: [
        { userId: new Types.ObjectId(userId) },
        { global: true },
      ],
    };
    const [data, total, unread] = await Promise.all([
      this.notificationModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      this.notificationModel.countDocuments(query),
      this.notificationModel.countDocuments({ ...query, read: false }),
    ]);
    return { data, total, unread, page: safePage, limit: safeLimit };
  }

  async markRead(id: string, userId: string) {
    return this.notificationModel.findByIdAndUpdate(
      id,
      { read: true, readAt: new Date() },
      { new: true },
    ).lean();
  }

  async markAllRead(userId: string) {
    await this.notificationModel.updateMany(
      {
        $or: [{ userId: new Types.ObjectId(userId) }, { global: true }],
        read: false,
      },
      { read: true, readAt: new Date() },
    );
    return { message: 'All notifications marked as read' };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      $or: [{ userId: new Types.ObjectId(userId) }, { global: true }],
      read: false,
    });
  }

  async deleteOld(olderThanDays = 30): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
    await this.notificationModel.deleteMany({ createdAt: { $lt: cutoff } });
  }
}
