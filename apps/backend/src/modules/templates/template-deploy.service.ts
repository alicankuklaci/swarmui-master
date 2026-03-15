import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Dockerode from 'dockerode';
import { Template, TemplateDocument } from './schemas/template.schema';
import { DeployTemplateDto } from './dto/template.dto';
import { DockerService } from '../../docker/docker.service';
import { StacksService } from '../swarm/stacks/stacks.service';

@Injectable()
export class TemplateDeployService {
  private readonly logger = new Logger(TemplateDeployService.name);

  constructor(
    @InjectModel(Template.name) private readonly templateModel: Model<TemplateDocument>,
    private readonly dockerService: DockerService,
    private readonly stacksService: StacksService,
  ) {}

  async deploy(templateId: string, dto: DeployTemplateDto) {
    const template = await this.templateModel.findById(templateId).lean();
    if (!template) throw new BadRequestException(`Template ${templateId} not found`);

    const docker = this.dockerService.getLocalConnection();
    const envValues = dto.envValues ?? {};

    if (template.type === 'container') {
      return this.deployContainer(docker, template, dto.name, envValues);
    } else if (template.type === 'swarm-service') {
      return this.deployService(docker, template, dto.name, envValues);
    } else if (template.type === 'stack') {
      return this.deployStack(docker, template, dto.name, envValues, dto.endpointId);
    }

    throw new BadRequestException(`Unknown template type: ${template.type}`);
  }

  private async deployContainer(
    docker: Dockerode,
    template: any,
    name: string | undefined,
    envValues: Record<string, string>,
  ) {
    const env = this.buildEnv(template.env ?? [], envValues);
    const portBindings: any = {};
    const exposedPorts: any = {};

    for (const p of template.ports ?? []) {
      const key = `${p.container}/${p.protocol || 'tcp'}`;
      exposedPorts[key] = {};
      if (p.host) {
        portBindings[key] = [{ HostPort: String(p.host) }];
      }
    }

    const binds: string[] = (template.volumes ?? []).map((v: any) => {
      if (v.bind) return `${v.bind}:${v.container}${v.readonly ? ':ro' : ''}`;
      return `${v.container}`;
    });

    const container = await docker.createContainer({
      name: name ?? `${template.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      Image: template.image,
      Env: env,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: binds,
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });

    await container.start();
    return { message: 'Container deployed', id: container.id };
  }

  private async deployService(
    docker: Dockerode,
    template: any,
    name: string | undefined,
    envValues: Record<string, string>,
  ) {
    const env = this.buildEnv(template.env ?? [], envValues);
    const ports = (template.ports ?? []).map((p: any) => ({
      Protocol: p.protocol || 'tcp',
      TargetPort: p.container,
      PublishedPort: p.host ?? 0,
      PublishMode: 'ingress',
    }));

    const service = await docker.createService({
      Name: name ?? `${template.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      TaskTemplate: {
        ContainerSpec: {
          Image: template.image,
          Env: env,
        },
      },
      EndpointSpec: { Ports: ports },
    });

    return { message: 'Service deployed', id: (service as any).ID };
  }

  private async deployStack(
    docker: Dockerode,
    template: any,
    name: string | undefined,
    envValues: Record<string, string>,
    endpointId?: string,
  ) {
    const rawName = name ?? template.title;
    const stackName = rawName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // diacritics
      .replace(/[^a-z0-9]+/g, '-')         // non-alphanumeric → dash
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63) || 'stack';
    let compose = template.composeContent ?? '';

    // Substitute env vars: ${VAR:-default} ve ${VAR}
    for (const envDef of (template.env ?? [])) {
      const value = envValues[envDef.name] ?? envDef.default ?? '';
      compose = compose
        .replace(new RegExp('\\$\\{' + envDef.name + ':-[^}]*\\}', 'g'), value)
        .replace(new RegExp('\\$\\{' + envDef.name + '\\}', 'g'), value);
    }

    this.logger.log(`Deploying stack template: ${stackName}`);
    try {
      const result = await this.stacksService.deploy(stackName, compose, endpointId);
      return { message: 'Stack deployed successfully', stackName, services: result };
    } catch (err: any) {
      this.logger.error(`Stack template deploy failed: ${err.message}`);
      throw new BadRequestException(`Stack deploy failed: ${err.message}`);
    }
  }

  private buildEnv(envDefs: any[], envValues: Record<string, string>): string[] {
    return envDefs.map((e: any) => {
      const value = envValues[e.name] ?? e.default ?? '';
      return `${e.name}=${value}`;
    });
  }
}
