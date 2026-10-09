import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { DockerModule } from '../../docker/docker.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MetricNode, MetricNodeSchema } from './schemas/metric-node.schema';
import { MetricContainer, MetricContainerSchema } from './schemas/metric-container.schema';
import { UptimeCheck, UptimeCheckSchema } from './schemas/uptime-check.schema';
import { UptimeHistory, UptimeHistorySchema } from './schemas/uptime-history.schema';
import { AlarmRule, AlarmRuleSchema } from './schemas/alarm-rule.schema';
import { Alarm, AlarmSchema } from './schemas/alarm.schema';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { UptimeProberService } from './services/uptime-prober.service';
import { AlarmEngineService } from './services/alarm-engine.service';
import { SnapshotService } from './services/snapshot.service';
import { AgentClientService } from './services/agent-client.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: MetricNode.name, schema: MetricNodeSchema },
      { name: MetricContainer.name, schema: MetricContainerSchema },
      { name: UptimeCheck.name, schema: UptimeCheckSchema },
      { name: UptimeHistory.name, schema: UptimeHistorySchema },
      { name: AlarmRule.name, schema: AlarmRuleSchema },
      { name: Alarm.name, schema: AlarmSchema },
    ]),
    DockerModule,
    NotificationsModule,
  ],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    MetricsCollectorService,
    UptimeProberService,
    AlarmEngineService,
    SnapshotService,
    AgentClientService,
  ],
  exports: [MonitoringService, MetricsCollectorService],
})
export class MonitoringModule {}
