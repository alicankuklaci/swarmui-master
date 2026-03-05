import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ActivityLogsService } from './activity-logs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Activity Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller({ path: 'logs/activity', version: '1' })
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Get activity logs' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('export') exportFormat?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (exportFormat === 'csv') {
      const result = await this.activityLogsService.findAll(1, 10000, { userId, action });
      const rows = result.data;
      const headers = ['time', 'username', 'action', 'method', 'path', 'statusCode', 'ip'];
      const csv = [
        headers.join(','),
        ...rows.map((r: any) =>
          [
            new Date(r.createdAt).toISOString(),
            r.username || '',
            r.action,
            r.method,
            r.path,
            r.statusCode || '',
            r.ip || '',
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        ),
      ].join('\n');
      res!.setHeader('Content-Type', 'text/csv');
      res!.setHeader('Content-Disposition', 'attachment; filename="activity-logs.csv"');
      res!.send(csv);
      return;
    }
    return this.activityLogsService.findAll(page, limit, { userId, action });
  }
}
