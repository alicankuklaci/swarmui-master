import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards,
} from '@nestjs/common';
import { VolumesService } from './volumes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('endpoints/:endpointId/volumes')
@UseGuards(JwtAuthGuard)
export class VolumesController {
  constructor(private readonly volumesService: VolumesService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.volumesService.list(endpointId);
  }

  @Post()
  create(
    @Param('endpointId') endpointId: string,
    @Body() body: { name: string; driver?: string; driverOpts?: Record<string, string>; labels?: Record<string, string> },
  ) {
    return this.volumesService.create(body.name, body.driver, body.driverOpts, body.labels, endpointId);
  }

  @Get(':name')
  inspect(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.volumesService.inspect(name, endpointId);
  }

  @Delete(':name')
  remove(
    @Param('endpointId') endpointId: string,
    @Param('name') name: string,
    @Query('force') force?: string,
  ) {
    return this.volumesService.remove(name, force === 'true', endpointId);
  }

  @Delete()
  prune(@Param('endpointId') endpointId: string) {
    return this.volumesService.prune(endpointId);
  }
}
