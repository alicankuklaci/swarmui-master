import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { NetworksService } from './networks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('endpoints/:endpointId/networks')
@UseGuards(JwtAuthGuard)
export class NetworksController {
  constructor(private readonly networksService: NetworksService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.networksService.list(endpointId);
  }

  @Post()
  create(
    @Param('endpointId') endpointId: string,
    @Body() body: { name: string; driver?: string; options?: Record<string, any> },
  ) {
    return this.networksService.create(body.name, body.driver, body.options, endpointId);
  }

  @Get(':id')
  inspect(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.networksService.inspect(id, endpointId);
  }

  @Delete(':id')
  remove(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.networksService.remove(id, endpointId);
  }

  @Post(':id/connect')
  @HttpCode(HttpStatus.OK)
  connect(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { containerId: string },
  ) {
    return this.networksService.connect(id, body.containerId, endpointId);
  }

  @Post(':id/disconnect')
  @HttpCode(HttpStatus.OK)
  disconnect(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { containerId: string; force?: boolean },
  ) {
    return this.networksService.disconnect(id, body.containerId, body.force, endpointId);
  }

  @Get(':id/containers')
  getContainers(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.networksService.getContainers(id, endpointId);
  }

  @Delete()
  prune(@Param('endpointId') endpointId: string) {
    return this.networksService.prune(endpointId);
  }
}
