import {
  Controller, Get, Post, Delete, Param, Query, Body,
  Sse, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ImagesService } from './images.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('endpoints/:endpointId/images')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.imagesService.list(endpointId);
  }

  @Get('search')
  search(@Param('endpointId') endpointId: string, @Query('term') term: string) {
    return this.imagesService.search(term, endpointId);
  }

  @Get(':id')
  inspect(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.imagesService.inspect(id, endpointId);
  }

  @Get(':id/history')
  history(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.imagesService.history(id, endpointId);
  }

  @Get(':id/check-update')
  checkUpdate(@Param('endpointId') endpointId: string, @Param('id') id: string) {
    return this.imagesService.checkUpdate(id, endpointId);
  }

  @Sse('pull')
  @Roles('admin', 'operator')
  pull(
    @Param('endpointId') endpointId: string,
    @Query('image') image: string,
    @Query('tag') tag?: string,
  ): Observable<MessageEvent> {
    return this.imagesService.pull(image, tag || 'latest', endpointId);
  }

  @Post(':id/tag')
  @Roles('admin', 'operator')
  @HttpCode(HttpStatus.OK)
  tag(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { repo: string; tag: string },
  ) {
    return this.imagesService.tag(id, body.repo, body.tag, endpointId);
  }

  @Delete(':id')
  @Roles('admin', 'operator')
  remove(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    return this.imagesService.remove(id, force === 'true', endpointId);
  }

  @Delete()
  @Roles('admin')
  prune(@Param('endpointId') endpointId: string) {
    return this.imagesService.prune(endpointId);
  }
}
