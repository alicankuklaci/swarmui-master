import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationChannel, NotificationChannelSchema } from './schemas/notification-channel.schema';
import { NotificationLog, NotificationLogSchema } from './schemas/notification-log.schema';
import { NotificationsService } from './notifications.service';
import { EmailNotificationService } from './email-notification.service';
import { WebhookNotificationService } from './webhook-notification.service';
import { EventBusService } from './event-bus.service';
import { NotificationsController } from './notifications.controller';
import { NotificationChannelsService } from './notification-channels.service';
import { NotificationChannelsController } from './notification-channels.controller';
import { ChannelRegistryService } from './channel-registry.service';
import { TelegramChannel } from './channels/telegram.channel';
import { SlackChannel } from './channels/slack.channel';
import { EmailChannel } from './channels/email.channel';
import { WebhookChannel } from './channels/webhook.channel';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationChannel.name, schema: NotificationChannelSchema },
      { name: NotificationLog.name, schema: NotificationLogSchema },
    ]),
  ],
  controllers: [NotificationsController, NotificationChannelsController],
  providers: [
    NotificationsService, EmailNotificationService, WebhookNotificationService, EventBusService,
    NotificationChannelsService, ChannelRegistryService,
    TelegramChannel, SlackChannel, EmailChannel, WebhookChannel,
  ],
  exports: [
    NotificationsService, EmailNotificationService, WebhookNotificationService, EventBusService,
    NotificationChannelsService, ChannelRegistryService,
  ],
})
export class NotificationsModule {}
