import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GitopsDeploymentDocument = GitopsDeployment & Document;

export class GitopsDeployHistory {
  commitSha: string;
  commitMessage: string;
  deployedAt: Date;
  status: string;
  error?: string;
}

@Schema({ timestamps: true })
export class GitopsDeployment {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['stack', 'service'] })
  deployType: string;

  @Prop({ required: true })
  repoUrl: string;

  @Prop({ default: 'main' })
  branch: string;

  @Prop({ default: '' })
  composePath: string;

  @Prop({ default: '' })
  gitCredentialsId: string;

  @Prop({ default: '' })
  endpointId: string;

  @Prop({ default: 5 })
  pollingIntervalMinutes: number;

  @Prop({ default: true })
  autoUpdate: boolean;

  @Prop({ default: '' })
  webhookToken: string;

  @Prop({
    default: 'idle',
    enum: ['idle', 'running', 'success', 'failed'],
  })
  status: string;

  @Prop({ default: '' })
  lastCommitSha: string;

  @Prop({ default: '' })
  lastCommitMessage: string;

  @Prop({ type: Date, default: null })
  lastDeployedAt: Date | null;

  @Prop({ default: '' })
  lastError: string;

  // Change Window: only deploy during allowed time
  @Prop({ default: false })
  changeWindowEnabled: boolean;

  @Prop({ default: '00:00' })
  changeWindowStart: string; // HH:MM

  @Prop({ default: '23:59' })
  changeWindowEnd: string; // HH:MM

  @Prop({ type: [Number], default: [0,1,2,3,4,5,6] })
  changeWindowDays: number[]; // 0=Sun, 6=Sat

  @Prop({ type: [Object], default: [] })
  deployHistory: GitopsDeployHistory[];
}

export const GitopsDeploymentSchema = SchemaFactory.createForClass(GitopsDeployment);
GitopsDeploymentSchema.index({ endpointId: 1 });
