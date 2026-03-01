import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Dockerode from 'dockerode';
import { DockerService } from '../../../docker/docker.service';

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listNodes();
  }

  async inspect(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const node = docker.getNode(id);
    try {
      return await node.inspect();
    } catch (err: any) {
      throw new NotFoundException(`Node ${id} not found`);
    }
  }

  async update(
    id: string,
    availability?: 'active' | 'pause' | 'drain',
    role?: 'manager' | 'worker',
    labels?: Record<string, string>,
    endpointId?: string,
  ) {
    const docker = this.getDocker(endpointId);
    const node = docker.getNode(id);
    const current = await node.inspect();
    const spec = { ...current.Spec };

    if (availability) spec.Availability = availability;
    if (role) spec.Role = role;
    if (labels) spec.Labels = { ...(spec.Labels || {}), ...labels };

    await node.update({ version: current.Version.Index, ...spec });
    return node.inspect();
  }

  async remove(id: string, force = false, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const node = docker.getNode(id);
    await node.remove({ force });
    return { message: 'Node removed' };
  }
}
