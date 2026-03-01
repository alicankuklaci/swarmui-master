import {
  Controller, Get, Post, Delete, Param, Query, Body,
  Sse, UseGuards, HttpCode, HttpStatus, Patch,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ContainersService } from './containers.service';
import { CreateContainerDto, RenameContainerDto } from './dto/container.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/endpoints/:endpointId/containers')
@UseGuards(JwtAuthGuard)
export class ContainersController {
  constructor(private readonly containersService: ContainersService) {}

  @Get()
  list(@Param('endpointId') endpointId: string, @Query('all') all?: string) {
    return this.containersService.list(endpointId, all !== 'false');
  }

  @Post()
  create(@Param('endpointId') endpointId: string, @Body() dto: CreateContainerDto) {
    return this.containersService.create(dto, endpointId);
  }

  @Get(':id')
  inspect(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.containersService.inspect(id, endpointId);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.containersService.start(id, endpointId);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  stop(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.containersService.stop(id, endpointId);
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.OK)
  restart(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.containersService.restart(id, endpointId);
  }

  @Post(':id/kill')
  @HttpCode(HttpStatus.OK)
  kill(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Query('signal') signal?: string,
  ) {
    return this.containersService.kill(id, signal, endpointId);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.containersService.pause(id, endpointId);
  }

  @Post(':id/unpause')
  @HttpCode(HttpStatus.OK)
  unpause(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.containersService.unpause(id, endpointId);
  }

  @Patch(':id/rename')
  rename(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() dto: RenameContainerDto,
  ) {
    return this.containersService.rename(id, dto, endpointId);
  }

  @Delete(':id')
  remove(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    return this.containersService.remove(id, force === 'true', endpointId);
  }

  @Delete()
  prune(@Param('endpointId') endpointId: string) {
    return this.containersService.prune(endpointId);
  }

  @Sse(':id/logs')
  logs(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Query('tail') tail?: string,
    @Query('follow') follow?: string,
  ): Observable<MessageEvent> {
    return this.containersService.getLogs(id, tail ? parseInt(tail) : 100, follow === 'true', endpointId);
  }

  @Sse(':id/stats')
  stats(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
  ): Observable<MessageEvent> {
    return this.containersService.getStats(id, endpointId);
  }
}
