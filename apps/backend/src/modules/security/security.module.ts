import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecurityPolicy, SecurityPolicySchema } from './schemas/security-policy.schema';
import { SecurityPolicyService } from './security-policy.service';
import { TrivyScanService } from './trivy-scan.service';
import { SecretsService } from './secrets.service';
import { ConfigsService } from './configs.service';
import { SecurityController } from './security.controller';
import { DockerModule } from '../../docker/docker.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SecurityPolicy.name, schema: SecurityPolicySchema }]),
    DockerModule,
  ],
  controllers: [SecurityController],
  providers: [SecurityPolicyService, TrivyScanService, SecretsService, ConfigsService],
  exports: [SecurityPolicyService, TrivyScanService],
})
export class SecurityModule {}
