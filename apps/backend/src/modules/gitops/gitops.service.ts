import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { GitopsDeployment, GitopsDeploymentDocument } from './schemas/gitops-deployment.schema';
import { CreateGitopsDeploymentDto, UpdateGitopsDeploymentDto } from './dto/gitops.dto';

@Injectable()
export class GitopsService {
  private readonly logger = new Logger(GitopsService.name);

  constructor(
    @InjectModel(GitopsDeployment.name)
    private readonly deploymentModel: Model<GitopsDeploymentDocument>,
    @InjectQueue('gitops-polling') private readonly pollingQueue: Queue,
  ) {}

  async findAll() {
    return this.deploymentModel.find().lean();
  }

  async findOne(id: string) {
    const dep = await this.deploymentModel.findById(id).lean();
    if (!dep) throw new NotFoundException(`GitOps deployment ${id} not found`);
    return dep;
  }

  async create(dto: CreateGitopsDeploymentDto) {
    const webhookToken = uuidv4();
    const dep = new this.deploymentModel({
      ...dto,
      branch: dto.branch ?? 'main',
      composePath: dto.composePath ?? 'docker-compose.yml',
      pollingIntervalMinutes: dto.pollingIntervalMinutes ?? 5,
      autoUpdate: dto.autoUpdate ?? true,
      webhookToken,
      status: 'idle',
    });
    const saved = await dep.save();

    // Schedule polling job
    if (dto.autoUpdate !== false) {
      await this.schedulePolling(saved.id, dto.pollingIntervalMinutes ?? 5);
    }

    return saved.toObject();
  }

  async update(id: string, dto: UpdateGitopsDeploymentDto) {
    const dep = await this.deploymentModel.findById(id);
    if (!dep) throw new NotFoundException(`GitOps deployment ${id} not found`);
    Object.assign(dep, dto);
    const saved = await dep.save();

    // Re-schedule polling if interval changed
    if (dto.pollingIntervalMinutes) {
      await this.schedulePolling(id, dto.pollingIntervalMinutes);
    }

    return saved.toObject();
  }

  async remove(id: string) {
    const dep = await this.deploymentModel.findByIdAndDelete(id);
    if (!dep) throw new NotFoundException(`GitOps deployment ${id} not found`);
    return { message: 'GitOps deployment deleted' };
  }

  async triggerDeploy(id: string) {
    const dep = await this.deploymentModel.findById(id);
    if (!dep) throw new NotFoundException(`GitOps deployment ${id} not found`);

    await this.pollingQueue.add('poll', { deploymentId: id }, { attempts: 3 });
    return { message: 'Deploy triggered' };
  }

  async handleWebhook(token: string, payload: any, headers: any) {
    const dep = await this.deploymentModel.findOne({ webhookToken: token }).lean();
    if (!dep) {
      this.logger.warn(`Webhook with unknown token: ${token}`);
      return { message: 'ok' };
    }

    // Validate GitHub signature
    if (headers['x-hub-signature-256']) {
      // Signature validation is handled in controller layer
    }

    this.logger.log(`Webhook triggered for deployment: ${dep.name}`);
    await this.pollingQueue.add('poll', { deploymentId: String(dep._id) }, { attempts: 3 });
    return { message: 'Webhook received' };
  }

  async getDeployHistory(id: string) {
    const dep = await this.deploymentModel.findById(id).lean();
    if (!dep) throw new NotFoundException(`GitOps deployment ${id} not found`);
    return dep.deployHistory ?? [];
  }

  private async schedulePolling(deploymentId: string, intervalMinutes: number) {
    const repeatJobKey = `poll:${deploymentId}`;

    // Remove existing repeatable job if any
    const repeatableJobs = await this.pollingQueue.getRepeatableJobs();
    const existing = repeatableJobs.find((j) => j.key === repeatJobKey);
    if (existing) {
      await this.pollingQueue.removeRepeatableByKey(existing.key);
    }

    await this.pollingQueue.add(
      'poll',
      { deploymentId },
      {
        repeat: { every: intervalMinutes * 60 * 1000 },
        jobId: repeatJobKey,
        attempts: 3,
      },
    );
  }
}
