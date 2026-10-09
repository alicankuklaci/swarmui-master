import { Injectable, BadRequestException } from '@nestjs/common';
import { TelegramChannel } from './channels/telegram.channel';
import { SlackChannel } from './channels/slack.channel';
import { EmailChannel } from './channels/email.channel';
import { WebhookChannel } from './channels/webhook.channel';
import { ChannelAdapter, ChannelFieldSchema } from './channels/channel.interface';

export type ChannelType = 'telegram' | 'slack' | 'email' | 'webhook';

@Injectable()
export class ChannelRegistryService {
  private readonly adapters = new Map<ChannelType, ChannelAdapter>();

  constructor(
    private readonly telegram: TelegramChannel,
    private readonly slack: SlackChannel,
    private readonly email: EmailChannel,
    private readonly webhook: WebhookChannel,
  ) {
    this.adapters.set('telegram', telegram);
    this.adapters.set('slack', slack);
    this.adapters.set('email', email);
    this.adapters.set('webhook', webhook);
  }

  get(type: ChannelType): ChannelAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new BadRequestException(`Unknown channel type: ${type}`);
    return adapter;
  }

  types(): Array<{ type: ChannelType; schema: ChannelFieldSchema[] }> {
    const out: Array<{ type: ChannelType; schema: ChannelFieldSchema[] }> = [];
    for (const [type, adapter] of this.adapters.entries()) {
      out.push({ type, schema: adapter.schema() });
    }
    return out;
  }

  validate(type: ChannelType, config: any): void {
    const err = this.get(type).validate(config);
    if (err) throw new BadRequestException(err);
  }

  mask(type: ChannelType, config: any): Record<string, any> {
    return this.get(type).mask(config);
  }
}
