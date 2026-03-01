import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationsService } from './notifications.service';
import { EmailNotificationService } from './email-notification.service';
import { WebhookNotificationService } from './webhook-notification.service';
import { EventBusService } from './event-bus.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailNotificationService, WebhookNotificationService, EventBusService],
  exports: [NotificationsService, EmailNotificationService, WebhookNotificationService, EventBusService],
})
export class NotificationsModule {}
