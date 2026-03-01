import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class ConfigsService {
  private readonly logger = new Logger(ConfigsService.name);

  constructor(private readonly dockerService: DockerService) {}

  async listConfigs(endpointId: string) {
    try {
      const docker = endpointId === 'local' ? this.dockerService.getLocalConnection() : await this.dockerService.getConnection(endpointId);
      const configs = await (docker as any).listConfigs();
      return configs.map((c: any) => ({
        id: c.ID,
        name: c.Spec?.Name,
        labels: c.Spec?.Labels,
        createdAt: c.CreatedAt,
        updatedAt: c.UpdatedAt,
      }));
    } catch (err: any) {
      this.logger.error(`List configs failed: ${err.message}`);
      return [];
    }
  }

  async createConfig(endpointId: string, name: string, value: string, labels?: Record<string, string>) {
    const docker = endpointId === 'local' ? this.dockerService.getLocalConnection() : await this.dockerService.getConnection(endpointId);
    try {
      const config = await (docker as any).createConfig({
        Name: name,
        Data: Buffer.from(value).toString('base64'),
        Labels: labels || {},
      });
      return { id: config.id, name };
    } catch (err: any) {
      throw new BadRequestException(`Failed to create config: ${err.message}`);
    }
  }

  async deleteConfig(endpointId: string, configId: string) {
    const docker = endpointId === 'local' ? this.dockerService.getLocalConnection() : await this.dockerService.getConnection(endpointId);
    try {
      const config = (docker as any).getConfig(configId);
      await config.remove();
      return { message: 'Config deleted' };
    } catch (err: any) {
      throw new BadRequestException(`Failed to delete config: ${err.message}`);
    }
  }
}
