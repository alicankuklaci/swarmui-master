import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { WebhookNotificationService } from './webhook-notification.service';

export interface AppEvent {
  type: string;
  title: string;
  message: string;
  level?: 'info' | 'warning' | 'error' | 'success';
  resourceType?: string;
  resourceId?: string;
  userId?: string;
}

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly notificationsService: NotificationsService,
    private readonly webhookService: WebhookNotificationService,
  ) {}

  emit(event: AppEvent) {
    this.emitter.emit(`app.${event.type}`, event);
  }

  @OnEvent('app.*')
  async handleEvent(event: AppEvent) {
    try {
      await this.notificationsService.create({
        title: event.title,
        message: event.message,
        level: event.level || 'info',
        global: !event.userId,
        userId: event.userId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
      });
    } catch (err: any) {
      this.logger.error(`Event handler failed: ${err.message}`);
    }
  }
}
