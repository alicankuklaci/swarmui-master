import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Dockerode from 'dockerode';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class NetworksService {
  private readonly logger = new Logger(NetworksService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listNetworks();
  }

  async inspect(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const network = docker.getNetwork(id);
    try {
      return await network.inspect();
    } catch (err: any) {
      throw new NotFoundException(`Network ${id} not found`);
    }
  }

  async create(
    name: string,
    driver = 'bridge',
    options: Record<string, any> = {},
    endpointId?: string,
  ) {
    const docker = this.getDocker(endpointId);
    const network = await docker.createNetwork({
      Name: name,
      Driver: driver,
      ...options,
    });
    return network.inspect();
  }

  async remove(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const network = docker.getNetwork(id);
    try {
      await network.remove();
      return { message: 'Network removed' };
    } catch (err: any) {
      throw new NotFoundException(`Network ${id} not found`);
    }
  }

  async connect(id: string, containerId: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const network = docker.getNetwork(id);
    await network.connect({ Container: containerId });
    return { message: 'Container connected to network' };
  }

  async disconnect(id: string, containerId: string, force = false, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const network = docker.getNetwork(id);
    await network.disconnect({ Container: containerId, Force: force });
    return { message: 'Container disconnected from network' };
  }

  async prune(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.pruneNetworks();
  }

  async getContainers(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const network = docker.getNetwork(id);
    try {
      const info = await network.inspect();
      const containers = info.Containers || {};
      return Object.entries(containers).map(([cId, c]: [string, any]) => ({
        id: cId,
        name: c.Name || '',
        ipv4: c.IPv4Address || '',
        mac: c.MacAddress || '',
        ipv6: c.IPv6Address || '',
      }));
    } catch (err: any) {
      throw new NotFoundException(`Network ${id} not found`);
    }
  }
}
