import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationChannelsService, CreateChannelDto, UpdateChannelDto } from './notification-channels.service';

@ApiTags('Notification Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('admin', 'operator')
@Controller({ path: 'notifications/channels', version: '1' })
export class NotificationChannelsController {
  constructor(private readonly svc: NotificationChannelsService) {}

  @Get('types')
  @ApiOperation({ summary: 'List supported channel types + their form schema' })
  types() {
    return this.svc.types();
  }

  @Get()
  @ApiOperation({ summary: 'List all notification channels (configs masked)' })
  async list() {
    return this.svc.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single channel (masked)' })
  async findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a channel' })
  async create(@Body() dto: CreateChannelDto, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a channel' })
  async update(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a channel' })
  async remove(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test notification through the channel' })
  async test(@Param('id') id: string) {
    return this.svc.test(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Delivery log for one channel' })
  async logs(@Param('id') id: string, @Query('limit') limit?: number) {
    return this.svc.logs({ channelId: id, limit });
  }
}
