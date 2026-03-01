import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BackupJob, BackupJobSchema } from './schemas/backup-job.schema';
import { BackupService } from './backup.service';
import { ScheduledBackupService } from './scheduled-backup.service';
import { S3BackupService } from './s3-backup.service';
import { BackupController } from './backup.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([{ name: BackupJob.name, schema: BackupJobSchema }]),
  ],
  controllers: [BackupController],
  providers: [BackupService, ScheduledBackupService, S3BackupService],
  exports: [BackupService],
})
export class BackupModule {}
