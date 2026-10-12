import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
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

  // Sprint 8 security: per-user SSE authz. Without this check, any
  // authenticated user could tail any other user's install session by
  // guessing the sessionId (UUID — 128-bit random, hard but not
  // impossible under a leaked-log scenario). The install doc's
  // initiatedBy field is the authoritative owner; a request from any
  // other user is refused with 404 (we deliberately don't 403 — leaking
  // "that session exists but isn't yours" is itself a side-channel).
  //
  // Admins (role === 'admin') bypass the check so an operator can tail
  // another user's install while debugging. All non-admin accesses are
  // scoped to their own session.
  @Sse('install/:sessionId/events')
  @ApiOperation({
    summary:
      'Live SSE stream of install plan step events. Completes on terminal frame (done | failed).',
  })
  async streamInstallEvents(
    @Param('sessionId') sessionId: string,
    @Req()
    req: {
      user?: {
        sub?: string;
        id?: string;
        username?: string;
        role?: string;
      };
    },
  ): Promise<Observable<MessageEvent>> {
    const who =
      req?.user?.sub ?? req?.user?.id ?? req?.user?.username ?? 'unknown';
    const isAdmin = req?.user?.role === 'admin';
    if (!isAdmin) {
      const doc = await this.storage.getStatus();
      // We require the doc to exist, the install session to match, AND
      // initiatedBy to equal the requester. If any check fails we 404 —
      // the two error branches collapse to one message to avoid leaking
      // "exists but not yours".
      if (
        !doc ||
        (doc as { installSessionId?: string; initiatedBy?: string })
          .installSessionId !== sessionId ||
        (doc as { installSessionId?: string; initiatedBy?: string })
          .initiatedBy !== who
      ) {
        throw new NotFoundException(
          `install session ${sessionId} not found or not accessible`,
        );
      }
    }
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
      // per connection across the orchestrator's EventEmitter. Also bumps
      // EventEmitter2's maxListeners so a swarm with many concurrent SSE
      // subscribers doesn't hit the "possible memory leak" warning at 10.
      return () => {
        this.emitter.off(STORAGE_INSTALL_EVENT, handler);
      };
    });
  }
}
