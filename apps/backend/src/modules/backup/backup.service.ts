import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BackupJob, BackupJobDocument } from './schemas/backup-job.schema';
import { CreateBackupDto } from './dto/create-backup.dto';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;

  constructor(
    @InjectModel(BackupJob.name) private readonly backupModel: Model<BackupJobDocument>,
    private readonly config: ConfigService,
  ) {
    this.backupDir = this.config.get<string>('BACKUP_DIR', '/tmp/swarmui-backups');
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.backupModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.backupModel.countDocuments(),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const job = await this.backupModel.findById(id).lean();
    if (!job) throw new NotFoundException('Backup job not found');
    return job;
  }

  async createAndRun(dto: CreateBackupDto, userId: string): Promise<BackupJobDocument> {
    const job = await this.backupModel.create({
      ...dto,
      status: 'running',
      startedAt: new Date(),
      createdBy: userId,
    });

    // Run async, don't block response
    this.runBackup(job._id.toString()).catch((err) => {
      this.logger.error(`Backup ${job._id} failed: ${err.message}`);
    });

    return job;
  }

  async runBackup(jobId: string) {
    const job = await this.backupModel.findById(jobId);
    if (!job) return;

    try {
      await this.backupModel.findByIdAndUpdate(jobId, { status: 'running', startedAt: new Date() });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `backup-${timestamp}.zip`;
      const filePath = path.join(this.backupDir, fileName);

      await this.createZipBackup(filePath, job.includeDatabase, job.includeConfigs);

      const stat = fs.statSync(filePath);

      await this.backupModel.findByIdAndUpdate(jobId, {
        status: 'success',
        filePath,
        fileSize: stat.size,
        completedAt: new Date(),
      });

      this.logger.log(`Backup ${jobId} completed: ${filePath}`);
    } catch (err: any) {
      this.logger.error(`Backup ${jobId} error: ${err.message}`);
      await this.backupModel.findByIdAndUpdate(jobId, {
        status: 'failed',
        error: err.message,
        completedAt: new Date(),
      });
    }
  }

  private async createZipBackup(outputPath: string, includeDatabase: boolean, includeConfigs: boolean): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = (archiver as any)('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err: any) => reject(err));
      archive.pipe(output);

      // Add a manifest
      const manifest = {
        createdAt: new Date().toISOString(),
        includeDatabase,
        includeConfigs,
        version: '1.0',
      };
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

      if (includeDatabase) {
        try {
          const mongoUri = this.config.get<string>('MONGODB_URI', '');
          const dumpDir = path.join(this.backupDir, `dump-${Date.now()}`);
          await execAsync(`mongodump --uri="${mongoUri}" --out="${dumpDir}" 2>/dev/null || true`);
          if (fs.existsSync(dumpDir)) {
            archive.directory(dumpDir, 'mongodb-dump');
          }
        } catch (err: any) {
          this.logger.warn(`MongoDB dump failed (skipping): ${err.message}`);
          archive.append('MongoDB dump failed', { name: 'mongodb-dump-error.txt' });
        }
      }

      if (includeConfigs) {
        const configPaths = [
          { src: '/etc/nginx', name: 'configs/nginx' },
          { src: '/home/nlc/projects/swarmui/.env', name: 'configs/.env' },
        ];
        for (const cp of configPaths) {
          try {
            if (fs.existsSync(cp.src)) {
              const stat = fs.statSync(cp.src);
              if (stat.isDirectory()) {
                archive.directory(cp.src, cp.name);
              } else {
                archive.file(cp.src, { name: cp.name });
              }
            }
          } catch (_) {}
        }
      }

      archive.finalize();
    });
  }

  async delete(id: string) {
    const job = await this.backupModel.findByIdAndDelete(id).lean();
    if (!job) throw new NotFoundException('Backup job not found');
    // Clean up file if it exists locally
    if (job.filePath && fs.existsSync(job.filePath)) {
      try { fs.unlinkSync(job.filePath); } catch (_) {}
    }
    return { message: 'Backup deleted' };
  }

  async getDownloadPath(id: string): Promise<string> {
    const job = await this.backupModel.findById(id).lean();
    if (!job) throw new NotFoundException('Backup job not found');
    if (!job.filePath || !fs.existsSync(job.filePath)) {
      throw new NotFoundException('Backup file not found on disk');
    }
    return job.filePath;
  }
}
