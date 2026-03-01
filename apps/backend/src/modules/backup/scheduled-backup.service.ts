import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BackupJob, BackupJobDocument } from './schemas/backup-job.schema';
import { BackupService } from './backup.service';

@Injectable()
export class ScheduledBackupService {
  private readonly logger = new Logger(ScheduledBackupService.name);

  constructor(
    @InjectModel(BackupJob.name) private readonly backupModel: Model<BackupJobDocument>,
    private readonly backupService: BackupService,
  ) {}

  // Run daily at 2 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runScheduledBackups() {
    const jobs = await this.backupModel.find({ scheduled: true }).lean();
    if (jobs.length === 0) return;

    this.logger.log(`Running ${jobs.length} scheduled backup(s)`);
    for (const job of jobs) {
      try {
        await this.backupService.runBackup(job._id.toString());
      } catch (err: any) {
        this.logger.error(`Scheduled backup ${job._id} failed: ${err.message}`);
      }
    }
  }
}
