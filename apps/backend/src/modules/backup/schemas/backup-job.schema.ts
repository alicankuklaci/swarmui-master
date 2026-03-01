import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BackupJobDocument = BackupJob & Document;

export type BackupStatus = 'pending' | 'running' | 'success' | 'failed';
export type BackupStorage = 'local' | 's3' | 'minio';

@Schema({ timestamps: true, collection: 'backup_jobs' })
export class BackupJob {
  @Prop({ required: true })
  name: string;

  @Prop({ default: false })
  scheduled: boolean;

  @Prop()
  cronExpression?: string;

  @Prop({ type: String, enum: ['local', 's3', 'minio'], default: 'local' })
  storage: BackupStorage;

  @Prop({ type: String, enum: ['pending', 'running', 'success', 'failed'], default: 'pending' })
  status: BackupStatus;

  @Prop({ default: false })
  includeDatabase: boolean;

  @Prop({ default: true })
  includeConfigs: boolean;

  @Prop()
  filePath?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  s3Bucket?: string;

  @Prop()
  s3Key?: string;

  @Prop()
  s3Region?: string;

  @Prop()
  error?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  nextRunAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const BackupJobSchema = SchemaFactory.createForClass(BackupJob);
BackupJobSchema.index({ status: 1 });
BackupJobSchema.index({ createdAt: -1 });
BackupJobSchema.index({ nextRunAt: 1 });
