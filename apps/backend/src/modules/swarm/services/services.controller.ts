import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards, HttpCode, HttpStatus, Patch, Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@Controller('endpoints/:endpointId/swarm/services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.servicesService.list(endpointId);
  }

  @Post()
  create(@Param('endpointId') endpointId: string, @Body() spec: any) {
    return this.servicesService.create(spec, endpointId);
  }

  @Get(':id')
  inspect(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.servicesService.inspect(id, endpointId);
  }

  @Patch(':id')
  update(@Param('endpointId') endpointId: string, @Param('id') id: string, @Body() spec: any) {
    return this.servicesService.update(id, spec, endpointId);
  }

  @Post(':id/scale')
  @HttpCode(HttpStatus.OK)
  scale(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { replicas: number },
  ) {
    return this.servicesService.scale(id, body.replicas, endpointId);
  }

  @Post(':id/force-update')
  @HttpCode(HttpStatus.OK)
  forceUpdate(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.servicesService.forceUpdate(id, endpointId);
  }

  @Patch(':id/update-policy')
  updatePolicy(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { parallelism?: number; delay?: number; failureAction?: string; order?: string },
  ) {
    return this.servicesService.updatePolicy(id, body.parallelism, body.delay, body.failureAction, body.order, endpointId);
  }

  @Post(':id/rollback')
  @HttpCode(HttpStatus.OK)
  rollback(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.servicesService.rollback(id, endpointId);
  }

  @Delete(':id')
  remove(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.servicesService.remove(id, endpointId);
  }

  @Get(':id/tasks')
  tasks(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.servicesService.tasks(id, endpointId);
  }

  @Sse(':id/logs')
  logs(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Query('tail') tail?: string,
    @Query('follow') follow?: string,
  ): Observable<MessageEvent> {
    return this.servicesService.getLogs(id, tail ? parseInt(tail) : 100, follow === 'true', endpointId);
  }
}
