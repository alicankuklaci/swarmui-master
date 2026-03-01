import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Dockerode from 'dockerode';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class VolumesService {
  private readonly logger = new Logger(VolumesService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listVolumes();
  }

  async inspect(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const volume = docker.getVolume(name);
    try {
      return await volume.inspect();
    } catch (err: any) {
      throw new NotFoundException(`Volume ${name} not found`);
    }
  }

  async create(
    name: string,
    driver = 'local',
    driverOpts: Record<string, string> = {},
    labels: Record<string, string> = {},
    endpointId?: string,
  ) {
    const docker = this.getDocker(endpointId);
    const volume = await docker.createVolume({
      Name: name,
      Driver: driver,
      DriverOpts: driverOpts,
      Labels: labels,
    });
    return volume;
  }

  async remove(name: string, force = false, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const volume = docker.getVolume(name);
    try {
      await volume.remove({ force });
      return { message: 'Volume removed' };
    } catch (err: any) {
      throw new NotFoundException(`Volume ${name} not found`);
    }
  }

  async prune(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.pruneVolumes();
  }
}
