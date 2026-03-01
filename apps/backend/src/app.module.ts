import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TeamsModule } from './modules/teams/teams.module';
import { RolesModule } from './modules/roles/roles.module';
import { EndpointsModule } from './modules/endpoints/endpoints.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { AuthLogsModule } from './modules/auth-logs/auth-logs.module';
import { DockerModule } from './docker/docker.module';
import { ContainersModule } from './modules/containers/containers.module';
import { ImagesModule } from './modules/images/images.module';
import { NetworksModule } from './modules/networks/networks.module';
import { VolumesModule } from './modules/volumes/volumes.module';
import { SwarmModule } from './modules/swarm/swarm.module';
import { GatewayModule } from './gateway/gateway.module';
import { RegistriesModule } from './modules/registries/registries.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { GitopsModule } from './modules/gitops/gitops.module';
import { BackupModule } from './modules/backup/backup.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SecurityModule } from './modules/security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://admin:password@localhost:27017/swarmui?authSource=admin'),
        connectionFactory: (connection: any) => {
          connection.on('connected', () => console.log('MongoDB connected'));
          connection.on('error', (err: any) => console.error('MongoDB error:', err));
          return connection;
        },
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD', 'redispassword'),
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    UsersModule,
    TeamsModule,
    RolesModule,
    EndpointsModule,
    SettingsModule,
    ActivityLogsModule,
    AuthLogsModule,
    DockerModule,
    ContainersModule,
    ImagesModule,
    NetworksModule,
    VolumesModule,
    SwarmModule,
    GatewayModule,
    RegistriesModule,
    TemplatesModule,
    GitopsModule,
    BackupModule,
    NotificationsModule,
    SecurityModule,
  ],
})
export class AppModule {}
