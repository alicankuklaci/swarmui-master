import {
  Controller, Get, Param, Query, Sse, UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('endpoints/:endpointId/events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async list(
    @Param('endpointId') endpointId: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const filters = type ? { type: [type] } : undefined;
    return this.eventsService.listEvents(endpointId, filters, limit ? parseInt(limit) : 100);
  }

  @Sse('stream')
  stream(
    @Param('endpointId') endpointId: string,
    @Query('type') type?: string,
  ): Observable<MessageEvent> {
    const filters = type ? { type: [type] } : undefined;
    return this.eventsService.streamEvents(endpointId, filters);
  }
}
