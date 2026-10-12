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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable, interval, map, take } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  InstallSessionResponseDto,
  InstallStorageDto,
} from './dto/install-storage.dto';
import { StorageService } from './storage.service';

// HTTP surface for the shared-storage feature. All endpoints are typed; the
// orchestration they delegate to raises NotImplementedException in Sprint 1 so
// the UI gets a crisp 501 (not an opaque 500) while the state machine lands in
// Sprint 2+. Swagger output is final — contracts don't move between sprints.
@ApiTags('shared-storage')
@ApiBearerAuth('access-token')
@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  @ApiOperation({ summary: 'Current shared-storage singleton (null = never installed).' })
  async status() {
    return this.storage.getStatus();
  }

  @Post('install')
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue an install run. Returns the session id for the SSE stream.' })
  @ApiResponse({ status: 202, type: InstallSessionResponseDto })
  @ApiResponse({ status: 501, description: 'Install orchestration lands in Sprint 2.' })
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
      'SSE stream of install plan step events. Sprint 1 emits a single placeholder frame and completes; Sprint 2 wires the state machine.',
  })
  streamInstallEvents(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    // One placeholder frame + complete. The real stream in Sprint 2 is driven
    // by the state machine's event emitter; shape (data: StorageAuditEntry-ish
    // JSON with { stepId, state, exitCode, durationMs }) is stable.
    return interval(0).pipe(
      take(1),
      map(
        () =>
          new MessageEvent('message', {
            data: JSON.stringify({
              sessionId,
              state: 'PENDING',
              note: 'install stream placeholder (Sprint 1); state machine lands in Sprint 2',
            }),
          }),
      ),
    );
  }
}
