import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Dockerode from 'dockerode';
import * as yaml from 'js-yaml';
import { DockerService } from '../../../docker/docker.service';
import { StackFile } from './stack-file.schema';

export interface StackInfo {
  name: string;
  services: number;
  tasks: number;
  createdAt: string;
}

@Injectable()
export class StacksService {
  private readonly logger = new Logger(StacksService.name);

  constructor(
    private readonly dockerService: DockerService,
    @InjectModel(StackFile.name) private stackFileModel: Model<StackFile>,
  ) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  private listServicesWithStatus(docker: Dockerode, filters?: Record<string, string[]>): Promise<any[]> {
    const opts: Record<string, any> = { status: true };
    if (filters) opts.filters = JSON.stringify(filters);
    return (docker as any).listServices(opts);
  }

  async list(endpointId?: string): Promise<StackInfo[]> {
    const docker = this.getDocker(endpointId);
    const [services, networks] = await Promise.all([
      this.listServicesWithStatus(docker),
      docker.listNetworks(),
    ]);

    const stacks = new Map<string, { serviceIds: string[]; running: number; desired: number }>();

    for (const svc of services) {
      const stackName = svc.Spec?.Labels?.['com.docker.stack.namespace'];
      if (!stackName) continue;

      if (!stacks.has(stackName)) {
        stacks.set(stackName, { serviceIds: [], running: 0, desired: 0 });
      }
      const stack = stacks.get(stackName)!;
      stack.serviceIds.push(svc.ID!);
      stack.running += (svc as any).ServiceStatus?.RunningTasks ?? 0;
      stack.desired += svc.Spec?.Mode?.Replicated?.Replicas
        ?? (svc as any).ServiceStatus?.DesiredTasks
        ?? (svc.Spec?.Mode?.Global !== undefined ? 1 : 1);
    }

    // Also discover stacks from networks (catches stacks with no running services)
    for (const net of networks) {
      const stackName = net.Labels?.['com.docker.stack.namespace'];
      if (stackName && !stacks.has(stackName)) {
        stacks.set(stackName, { serviceIds: [], running: 0, desired: 0 });
      }
    }

    const result: StackInfo[] = [];
    for (const [name, info] of stacks) {
      result.push({
        name,
        services: info.serviceIds.length,
        tasks: info.running,
        createdAt: new Date().toISOString(),
      });
    }

    return result;
  }

  async inspect(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const services = await this.listServicesWithStatus(docker, { label: [`com.docker.stack.namespace=${name}`] });
    if (services.length === 0) throw new NotFoundException(`Stack ${name} not found`);

    const serviceDetails = services.map((svc: any) => ({
      id: svc.ID,
      name: svc.Spec?.Name,
      image: svc.Spec?.TaskTemplate?.ContainerSpec?.Image?.split('@')[0] ?? '—',
      replicas: {
        running: svc.ServiceStatus?.RunningTasks ?? 0,
        desired: svc.Spec?.Mode?.Replicated?.Replicas ?? svc.ServiceStatus?.DesiredTasks ?? 1,
      },
      ports: svc.Endpoint?.Ports ?? [],
      updatedAt: svc.UpdatedAt,
    }));

    return { name, services: serviceDetails };
  }

  async getServices(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return this.listServicesWithStatus(docker, { label: [`com.docker.stack.namespace=${name}`] });
  }

  async getTasks(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listTasks({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });
  }

  async deploy(name: string, composeContent: string, endpointId?: string) {
    // Store compose file in MongoDB for persistence
    await this.stackFileModel.findOneAndUpdate(
      { name },
      { content: composeContent },
      { upsert: true },
    );

    // Parse compose and deploy services
    try {
      const compose = this.parseComposeFile(composeContent);

      if (!compose.services || Object.keys(compose.services).length === 0) {
        throw new Error('No services defined in compose file');
      }

      const docker = this.getDocker(endpointId);
      const deployedServices: any[] = [];

      // Create networks first
      if (compose.networks) {
        for (const [networkName] of Object.entries(compose.networks || {})) {
          const fullNetworkName = `${name}_${networkName}`;
          try {
            const existing = await docker.listNetworks({
              filters: JSON.stringify({ name: [fullNetworkName] }),
            });
            if (existing.length === 0) {
              await docker.createNetwork({
                Name: fullNetworkName,
                Driver: 'overlay',
                Labels: { 'com.docker.stack.namespace': name },
              });
            }
          } catch (err: any) {
            this.logger.warn(`Failed to create network ${fullNetworkName}: ${err.message}`);
          }
        }
      }

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
      throw new BadRequestException(`Failed to deploy stack: ${err.message}`);
    }
  }

  async remove(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const services = await docker.listServices({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });

    if (services.length === 0) throw new NotFoundException(`Stack ${name} not found`);

    await Promise.all(services.map(svc => docker.getService(svc.ID!).remove()));

    // Also clean up stack networks
    try {
      const networks = await docker.listNetworks({
        filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
      });
      await Promise.all(networks.map(net => docker.getNetwork(net.Id!).remove()));
    } catch (err: any) {
      this.logger.warn(`Failed to remove some networks for stack ${name}: ${err.message}`);
    }

    await this.stackFileModel.deleteOne({ name });

    return { message: `Stack ${name} removed` };
  }

  async getComposeFile(name: string): Promise<string> {
    const doc = await this.stackFileModel.findOne({ name });
    if (!doc) throw new NotFoundException(`Compose file for stack ${name} not found`);
    return doc.content;
  }

  private parseComposeFile(content: string): any {
    // Try JSON first
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Not JSON, try YAML
    }

    // Parse YAML
    try {
      const parsed = yaml.load(content) as any;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid compose file format');
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`Invalid compose file: ${err.message}`);
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
          const parts = String(p).split(':');
          return {
            Protocol: 'tcp',
            PublishedPort: parseInt(parts[0]) || 0,
            TargetPort: parseInt(parts[1] || parts[0]),
          };
        }),
      },
    };
  }
  async update(name: string, composeContent: string, endpointId?: string) {
    return this.deploy(name, composeContent, endpointId);
  }


}
