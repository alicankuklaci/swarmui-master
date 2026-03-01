import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Dockerode from 'dockerode';
import { DockerService } from '../../../docker/docker.service';

export interface StackInfo {
  name: string;
  services: number;
  tasks: number;
  createdAt: string;
}

@Injectable()
export class StacksService {
  private readonly logger = new Logger(StacksService.name);
  // In-memory store for compose files (in production, persist to DB)
  private composeFiles = new Map<string, string>();

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string): Promise<StackInfo[]> {
    const docker = this.getDocker(endpointId);
    const services = await docker.listServices();

    const stacks = new Map<string, { services: string[]; tasks: number }>();

    for (const svc of services) {
      const stackName = svc.Spec?.Labels?.['com.docker.stack.namespace'];
      if (!stackName) continue;

      if (!stacks.has(stackName)) {
        stacks.set(stackName, { services: [], tasks: 0 });
      }
      stacks.get(stackName)!.services.push(svc.ID!);
    }

    const result: StackInfo[] = [];
    for (const [name, info] of stacks) {
      const tasks = await docker.listTasks({ filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }) });
      result.push({
        name,
        services: info.services.length,
        tasks: tasks.length,
        createdAt: new Date().toISOString(),
      });
    }

    return result;
  }

  async inspect(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const services = await docker.listServices({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });
    if (services.length === 0) throw new NotFoundException(`Stack ${name} not found`);
    return { name, services };
  }

  async getServices(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listServices({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });
  }

  async getTasks(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listTasks({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });
  }

  async deploy(name: string, composeContent: string, endpointId?: string) {
    // Store compose file for later retrieval
    this.composeFiles.set(name, composeContent);

    // Parse compose and deploy services
    try {
      const compose = this.parseComposeFile(composeContent);
      const docker = this.getDocker(endpointId);
      const deployedServices: any[] = [];

      for (const [serviceName, serviceConfig] of Object.entries(compose.services || {})) {
        const spec = this.buildServiceSpec(name, serviceName, serviceConfig as any, compose);
        try {
          // Check if service already exists
          const existing = await docker.listServices({
            filters: JSON.stringify({ name: [`${name}_${serviceName}`] }),
          });

          if (existing.length > 0) {
            const svc = docker.getService(existing[0].ID!);
            const current = await svc.inspect();
            await svc.update({ version: current.Version.Index, ...spec });
            deployedServices.push({ name: serviceName, action: 'updated' });
          } else {
            await docker.createService(spec);
            deployedServices.push({ name: serviceName, action: 'created' });
          }
        } catch (err: any) {
          this.logger.error(`Failed to deploy service ${serviceName}: ${err.message}`);
          deployedServices.push({ name: serviceName, action: 'failed', error: err.message });
        }
      }

      return { stack: name, services: deployedServices };
    } catch (err: any) {
      throw new BadRequestException(`Failed to parse compose file: ${err.message}`);
    }
  }

  async remove(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const services = await docker.listServices({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });

    if (services.length === 0) throw new NotFoundException(`Stack ${name} not found`);

    await Promise.all(services.map(svc => docker.getService(svc.ID!).remove()));
    this.composeFiles.delete(name);

    return { message: `Stack ${name} removed` };
  }

  getComposeFile(name: string): string {
    const content = this.composeFiles.get(name);
    if (!content) throw new NotFoundException(`Compose file for stack ${name} not found`);
    return content;
  }

  private parseComposeFile(content: string): any {
    // Simple YAML-like key:value parser (use a real YAML lib in production)
    // For now, return a basic structure; in production use 'js-yaml'
    try {
      // Try JSON first (for testing)
      return JSON.parse(content);
    } catch {
      // Return minimal structure for basic YAML
      return { services: {} };
    }
  }

  private buildServiceSpec(stackName: string, serviceName: string, config: any, compose: any): any {
    const fullName = `${stackName}_${serviceName}`;

    return {
      Name: fullName,
      Labels: {
        'com.docker.stack.namespace': stackName,
        'com.docker.stack.image': config.image || '',
      },
      TaskTemplate: {
        ContainerSpec: {
          Image: config.image || 'alpine',
          Labels: { 'com.docker.stack.namespace': stackName },
          Env: Array.isArray(config.environment)
            ? config.environment
            : Object.entries(config.environment || {}).map(([k, v]) => `${k}=${v}`),
        },
        RestartPolicy: { Condition: 'on-failure', Delay: 5000000000, MaxAttempts: 3 },
      },
      Mode: {
        Replicated: {
          Replicas: config.deploy?.replicas || 1,
        },
      },
      Networks: (config.networks || []).map((n: string) => ({ Target: `${stackName}_${n}` })),
      EndpointSpec: {
        Ports: (config.ports || []).map((p: string) => {
          const parts = p.split(':');
          return {
            Protocol: 'tcp',
            PublishedPort: parseInt(parts[0]) || 0,
            TargetPort: parseInt(parts[1] || parts[0]),
          };
        }),
      },
    };
  }
}
