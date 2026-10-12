import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  STORAGE_INSTALL_EVENT,
  type StorageInstallStepEvent,
} from '@swarmui-master/storage-plan';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  InstallSessionResponseDto,
  InstallStorageDto,
} from './dto/install-storage.dto';
import { StorageService } from './storage.service';

// HTTP surface for the shared-storage feature. The orchestration bodies land
// progressively; current state (Sprint 2):
//   - GET  /storage                       always available
//   - POST /storage/install               wired (fire-and-forget → SSE)
//   - DEL  /storage                       throws 501 (Sprint 4)
//   - SSE  /storage/install/:id/events    live state machine events
@ApiTags('shared-storage')
@ApiBearerAuth('access-token')
@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly emitter: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current shared-storage singleton (null = never installed).' })
  async status() {
    return this.storage.getStatus();
  }

  @Post('install')
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue an install run. Returns the session id for the SSE stream.' })
  @ApiResponse({ status: 202, type: InstallSessionResponseDto })
  async install(
    @Body() dto: InstallStorageDto,
    @Req() req: { user?: { sub?: string; id?: string; username?: string } },
  ): Promise<InstallSessionResponseDto> {
    const who = req?.user?.sub ?? req?.user?.id ?? req?.user?.username ?? 'unknown';
    return this.storage.queueInstall(dto, who);
  }

  @Delete()
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue the uninstall. Refuses while consumers remain.' })
  @ApiResponse({ status: 202, type: InstallSessionResponseDto })
  @ApiResponse({ status: 501, description: 'Uninstall orchestration lands in Sprint 4.' })
  async uninstall(
    @Req() req: { user?: { sub?: string; id?: string; username?: string } },
  ): Promise<InstallSessionResponseDto> {
    const who = req?.user?.sub ?? req?.user?.id ?? req?.user?.username ?? 'unknown';
    return this.storage.queueUninstall(who);
  }

  @Sse('install/:sessionId/events')
  @ApiOperation({
    summary:
      'Live SSE stream of install plan step events. Completes on terminal frame (done | failed).',
  })
  streamInstallEvents(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const handler = (frame: StorageInstallStepEvent) => {
        if (frame.sessionId !== sessionId) return;
        // SSE wrapper: `data` is the JSON frame; `id` carries the server
        // frame number so a reconnect can send Last-Event-ID: <N>. Only
        // string payloads survive node's SSE pipe cleanly.
        const msg = new MessageEvent('message', {
          data: JSON.stringify(frame),
          lastEventId: String(frame.frame),
        });
        subscriber.next(msg);
        if (frame.phase === 'done' || frame.phase === 'failed') {
          subscriber.complete();
        }
      };
      this.emitter.on(STORAGE_INSTALL_EVENT, handler);
      // Nest/rxjs invokes this teardown when the HTTP connection drops or
      // the subscriber completes — must remove the listener or we leak one
      // per connection across the orchestrator's EventEmitter.
      return () => {
        this.emitter.off(STORAGE_INSTALL_EVENT, handler);
      };
    });
  }
}
