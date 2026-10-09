import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MonitoringService } from './monitoring.service';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { UptimeProberService } from './services/uptime-prober.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('admin', 'operator')
@Controller({ path: 'monitoring', version: '1' })
export class MonitoringController {
  constructor(
    private readonly svc: MonitoringService,
    private readonly metrics: MetricsCollectorService,
    private readonly uptime: UptimeProberService,
  ) {}

  // ─── node metrics ────────────────────────────────────────────────────────

  @Get('nodes')
  @ApiOperation({ summary: 'Latest sample per node (grid view)' })
  async listNodes() {
    return this.metrics.latestNodeSamples();
  }

  @Get('nodes/:nodeId/metrics')
  @ApiOperation({ summary: 'Time-series for a node metric' })
  async nodeSeries(
    @Param('nodeId') nodeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('metric') _metric?: string,
  ) {
    const fromD = from ? new Date(from) : new Date(Date.now() - 3600_000);
    const toD = to ? new Date(to) : new Date();
    return this.metrics.nodeSeries(nodeId, fromD, toD);
  }

  // ─── container metrics ───────────────────────────────────────────────────

  @Get('containers')
  @ApiOperation({ summary: 'Top containers by CPU/mem (current)' })
  async containers(
    @Query('nodeId') nodeId?: string,
    @Query('sort') sort?: 'cpu' | 'mem',
    @Query('limit') limit?: string,
  ) {
    return this.metrics.latestContainers({
      nodeId, sort, limit: limit ? Number(limit) : 20,
    });
  }

  @Get('containers/:containerId/metrics')
  @ApiOperation({ summary: 'Time-series for a container' })
  async containerSeries(
    @Param('containerId') containerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromD = from ? new Date(from) : new Date(Date.now() - 3600_000);
    const toD = to ? new Date(to) : new Date();
    return this.metrics.containerSeries(containerId, fromD, toD);
  }

  // ─── uptime ──────────────────────────────────────────────────────────────

  @Get('uptime-checks')
  async listChecks() {
    return this.svc.listUptimeChecks();
  }

  @Post('uptime-checks')
  async createCheck(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.svc.createUptimeCheck(dto, userId);
  }

  @Patch('uptime-checks/:id')
  async updateCheck(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateUptimeCheck(id, dto);
  }

  @Delete('uptime-checks/:id')
  async deleteCheck(@Param('id') id: string) { return this.svc.deleteUptimeCheck(id); }

  @Post('uptime-checks/:id/test')
  @HttpCode(HttpStatus.OK)
  async testCheck(@Param('id') id: string) {
    return this.svc.testUptimeCheck(id);
  }

  @Get('uptime-checks/:id/history')
  async checkHistory(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromD = from ? new Date(from) : new Date(Date.now() - 24 * 3600_000);
    const toD = to ? new Date(to) : new Date();
    return this.uptime.history(id, fromD, toD);
  }

  // ─── alarm rules ─────────────────────────────────────────────────────────

  @Get('alarm-rules')
  async listRules() { return this.svc.listRules(); }

  @Post('alarm-rules')
  async createRule(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.svc.createRule(dto, userId);
  }

  @Patch('alarm-rules/:id')
  async updateRule(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateRule(id, dto);
  }

  @Delete('alarm-rules/:id')
  async deleteRule(@Param('id') id: string) { return this.svc.deleteRule(id); }

  @Post('alarm-rules/:id/test')
  @HttpCode(HttpStatus.OK)
  async testRule(@Param('id') id: string) {
    return this.svc.testRule(id);
  }

  // ─── alarms ──────────────────────────────────────────────────────────────

  @Get('alarms')
  async listAlarms(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listAlarms({
      status, severity,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('alarms/firing-count')
  async firingCount() { return { count: await this.svc.firingCount() }; }

  @Get('alarms/:id')
  async getAlarm(@Param('id') id: string) { return this.svc.getAlarm(id); }

  @Post('alarms/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async ack(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.svc.acknowledgeAlarm(id, userId);
  }
}
