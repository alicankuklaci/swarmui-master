import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { GitopsDeployment, GitopsDeploymentSchema } from './schemas/gitops-deployment.schema';
import { GitCredentials, GitCredentialsSchema } from './schemas/git-credentials.schema';
import { GitopsService } from './gitops.service';
import { GitCredentialsService } from './git-credentials.service';
import { GitopsController } from './gitops.controller';
import { GitopsPollingProcessor } from './processors/gitops-polling.processor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GitopsDeployment.name, schema: GitopsDeploymentSchema },
      { name: GitCredentials.name, schema: GitCredentialsSchema },
    ]),
    BullModule.registerQueue({ name: 'gitops-polling' }),
  ],
  controllers: [GitopsController],
  providers: [GitopsService, GitCredentialsService, GitopsPollingProcessor],
  exports: [GitopsService],
})
export class GitopsModule {}
