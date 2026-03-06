import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { NetworksService } from './networks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('endpoints/:endpointId/networks')
@UseGuards(JwtAuthGuard, RbacGuard)
export class NetworksController {
  constructor(private readonly networksService: NetworksService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.networksService.list(endpointId);
  }

  @Post()
  @Roles('admin', 'operator')
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
  @Roles('admin', 'operator')
  remove(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.networksService.remove(id, endpointId);
  }

  @Post(':id/connect')
  @Roles('admin', 'operator')
  @HttpCode(HttpStatus.OK)
  connect(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { containerId: string },
  ) {
    return this.networksService.connect(id, body.containerId, endpointId);
  }

  @Post(':id/disconnect')
  @Roles('admin', 'operator')
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
  @Roles('admin')
  prune(@Param('endpointId') endpointId: string) {
    return this.networksService.prune(endpointId);
  }
}
