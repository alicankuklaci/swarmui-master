import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards, Req, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { BackupService } from './backup.service';
import { CreateBackupDto } from './dto/create-backup.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller({ path: 'backup', version: '1' })
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all backup jobs' })
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.backupService.findAll(page, limit);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get backup job details' })
  findOne(@Param('id') id: string) {
    return this.backupService.findOne(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create and run a backup' })
  create(@Body() dto: CreateBackupDto, @CurrentUser('id') userId: string) {
    return this.backupService.createAndRun(dto, userId);
  }

  @Post('create')
  @Roles('admin')
  @ApiOperation({ summary: 'Create and run a backup (alias)' })
  createAlias(@Body() dto: CreateBackupDto, @CurrentUser('id') userId: string) {
    return this.backupService.createAndRun(dto, userId);
  }

  @Get(':id/download')
  @Roles('admin')
  @ApiOperation({ summary: 'Download backup file' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.backupService.getDownloadPath(id);
    res.download(filePath);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a backup job and its file' })
  remove(@Param('id') id: string) {
    return this.backupService.delete(id);
  }
}
