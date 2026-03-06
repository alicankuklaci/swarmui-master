import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards,
} from '@nestjs/common';
import { VolumesService } from './volumes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('endpoints/:endpointId/volumes')
@UseGuards(JwtAuthGuard, RbacGuard)
export class VolumesController {
  constructor(private readonly volumesService: VolumesService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.volumesService.list(endpointId);
  }

  @Post()
  @Roles('admin', 'operator')
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
  @Roles('admin', 'operator')
  remove(
    @Param('endpointId') endpointId: string,
    @Param('name') name: string,
    @Query('force') force?: string,
  ) {
    return this.volumesService.remove(name, force === 'true', endpointId);
  }

  @Get(':name/browse')
  browse(
    @Param('endpointId') endpointId: string,
    @Param('name') name: string,
    @Query('path') browsePath?: string,
  ) {
    return this.volumesService.browse(name, browsePath || '/', endpointId);
  }

  @Delete()
  @Roles('admin')
  prune(@Param('endpointId') endpointId: string) {
    return this.volumesService.prune(endpointId);
  }
}
