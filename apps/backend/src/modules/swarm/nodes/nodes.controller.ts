import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards, HttpCode, HttpStatus, Patch,
} from '@nestjs/common';
import { NodesService } from './nodes.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@Controller('endpoints/:endpointId/swarm/nodes')
@UseGuards(JwtAuthGuard)
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.nodesService.list(endpointId);
  }

  @Get(':id')
  inspect(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.nodesService.inspect(id, endpointId);
  }

  @Patch(':id')
  update(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { availability?: 'active' | 'pause' | 'drain'; role?: 'manager' | 'worker'; labels?: Record<string, string> },
  ) {
    return this.nodesService.update(id, body.availability, body.role, body.labels, endpointId);
  }

  @Delete(':id')
  remove(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    return this.nodesService.remove(id, force === 'true', endpointId);
  }
}
