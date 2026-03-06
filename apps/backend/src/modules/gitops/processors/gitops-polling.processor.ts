import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import * as https from 'https';
import * as http from 'http';
import { GitopsDeployment, GitopsDeploymentDocument } from '../schemas/gitops-deployment.schema';
import { GitCredentialsService } from '../git-credentials.service';

@Processor('gitops-polling')
export class GitopsPollingProcessor extends WorkerHost {
  private readonly logger = new Logger(GitopsPollingProcessor.name);

  constructor(
    @InjectModel(GitopsDeployment.name)
    private readonly deploymentModel: Model<GitopsDeploymentDocument>,
    private readonly gitCredentialsService: GitCredentialsService,
  ) {
    super();
  }

  async process(job: Job) {
    const { deploymentId } = job.data;
    const dep = await this.deploymentModel.findById(deploymentId);
    if (!dep) {
      this.logger.warn(`Deployment ${deploymentId} not found`);
      return;
    }

    this.logger.log(`Polling deployment: ${dep.name} (${dep.repoUrl})`);

    try {
      const latestCommit = await this.getLatestCommit(dep);
      if (!latestCommit) {
        this.logger.warn(`Could not fetch commit for ${dep.name}`);
        return;
      }

      if (latestCommit.sha === dep.lastCommitSha) {
        this.logger.debug(`No changes for ${dep.name}`);
        return;
      }


    // Check change window
    if (dep.changeWindowEnabled) {
      const now = new Date();
      const day = now.getDay();
      const hhmm = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = (dep.changeWindowStart || '00:00').split(':').map(Number);
      const [endH, endM] = (dep.changeWindowEnd || '23:59').split(':').map(Number);
      const start = startH * 60 + startM;
      const end = endH * 60 + endM;
      const days: number[] = dep.changeWindowDays?.length ? dep.changeWindowDays : [0,1,2,3,4,5,6];
      if (!days.includes(day) || hhmm < start || hhmm > end) {
        this.logger.log(`Change window closed for ${dep.name} — skipping deploy`);
        return;
      }
    }
      this.logger.log(`New commit detected for ${dep.name}: ${latestCommit.sha}`);

      // Mark as running
      dep.status = 'running';
      await dep.save();

      // Record deploy history
      const historyEntry = {
        commitSha: latestCommit.sha,
        commitMessage: latestCommit.message,
        deployedAt: new Date(),
        status: 'success',
      };

      // Update commit info
      dep.lastCommitSha = latestCommit.sha;
      dep.lastCommitMessage = latestCommit.message;
      dep.lastDeployedAt = new Date();
      dep.status = 'success';
      dep.lastError = '';
      dep.deployHistory = [historyEntry, ...(dep.deployHistory ?? [])].slice(0, 50);
      await dep.save();

      this.logger.log(`Deployment ${dep.name} updated to commit ${latestCommit.sha}`);
    } catch (err: any) {
      this.logger.error(`Polling failed for ${dep.name}: ${err.message}`);
      dep.status = 'failed';
      dep.lastError = err.message;
      await dep.save();
    }
  }

  private async getLatestCommit(dep: any): Promise<{ sha: string; message: string } | null> {
    try {
      const repoUrl = dep.repoUrl;

      // Try GitHub API
      const githubMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (githubMatch) {
        const [, owner, repo] = githubMatch;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${dep.branch}`;
        const result = await this.httpGet(apiUrl);
        if (result.status === 200) {
          const data = JSON.parse(result.body);
          return {
            sha: data.sha?.substring(0, 8) ?? '',
            message: data.commit?.message?.split('\n')[0] ?? '',
          };
        }
      }

      // Try GitLab API
      const gitlabMatch = repoUrl.match(/gitlab\.com[/:]([^/]+)\/([^/.]+)/);
      if (gitlabMatch) {
        const [, owner, repo] = gitlabMatch;
        const projectPath = encodeURIComponent(`${owner}/${repo}`);
        const apiUrl = `https://gitlab.com/api/v4/projects/${projectPath}/repository/commits/${dep.branch}`;
        const result = await this.httpGet(apiUrl);
        if (result.status === 200) {
          const data = JSON.parse(result.body);
          return {
            sha: data.id?.substring(0, 8) ?? '',
            message: data.title ?? '',
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private httpGet(url: string, token?: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options: any = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'SwarmUI/1.0',
          Accept: 'application/json',
        },
      };
      if (token) options.headers['Authorization'] = `Bearer ${token}`;

      const req = https.request(options, (res: any) => {
        let body = '';
        res.on('data', (d: Buffer) => (body += d.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }
}
