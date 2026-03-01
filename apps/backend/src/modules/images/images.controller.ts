import {
  Controller, Get, Post, Delete, Param, Query, Body,
  Sse, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ImagesService } from './images.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/endpoints/:endpointId/images')
@UseGuards(JwtAuthGuard)
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

  @Sse('pull')
  pull(
    @Param('endpointId') endpointId: string,
    @Query('image') image: string,
    @Query('tag') tag?: string,
  ): Observable<MessageEvent> {
    return this.imagesService.pull(image, tag || 'latest', endpointId);
  }

  @Post(':id/tag')
  @HttpCode(HttpStatus.OK)
  tag(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Body() body: { repo: string; tag: string },
  ) {
    return this.imagesService.tag(id, body.repo, body.tag, endpointId);
  }

  @Delete(':id')
  remove(
    @Param('endpointId') endpointId: string,
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    return this.imagesService.remove(id, force === 'true', endpointId);
  }

  @Delete()
  prune(@Param('endpointId') endpointId: string) {
    return this.imagesService.prune(endpointId);
  }
}
