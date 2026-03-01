import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthLogsService } from './auth-logs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Auth Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller({ path: 'logs/auth', version: '1' })
export class AuthLogsController {
  constructor(private readonly authLogsService: AuthLogsService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Get auth logs' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('event') event?: string,
    @Query('username') username?: string,
    @Query('export') exportFormat?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (exportFormat === 'csv') {
      const result = await this.authLogsService.findAll(1, 10000, { event, username });
      const rows = result.data;
      const headers = ['time', 'username', 'event', 'success', 'ip', 'userAgent', 'details'];
      const csv = [
        headers.join(','),
        ...rows.map((r: any) =>
          [
            new Date(r.createdAt).toISOString(),
            r.username || '',
            r.event,
            r.success ? 'true' : 'false',
            r.ip || '',
            r.userAgent || '',
            r.details || '',
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        ),
      ].join('\n');
      res!.setHeader('Content-Type', 'text/csv');
      res!.setHeader('Content-Disposition', 'attachment; filename="auth-logs.csv"');
      res!.send(csv);
      return;
    }
    return this.authLogsService.findAll(page, limit, { event, username });
  }
}
