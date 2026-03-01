import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(private readonly dockerService: DockerService) {}

  async listSecrets(endpointId: string) {
    try {
      const docker = endpointId === 'local' ? this.dockerService.getLocalConnection() : await this.dockerService.getConnection(endpointId);
      const secrets = await docker.listSecrets();
      return secrets.map((s: any) => ({
        id: s.ID,
        name: s.Spec?.Name,
        labels: s.Spec?.Labels,
        createdAt: s.CreatedAt,
        updatedAt: s.UpdatedAt,
      }));
    } catch (err: any) {
      this.logger.error(`List secrets failed: ${err.message}`);
      return [];
    }
  }

  async createSecret(endpointId: string, name: string, value: string, labels?: Record<string, string>) {
    const docker = endpointId === 'local' ? this.dockerService.getLocalConnection() : await this.dockerService.getConnection(endpointId);
    try {
      const secret = await (docker as any).createSecret({
        Name: name,
        Data: Buffer.from(value).toString('base64'),
        Labels: labels || {},
      });
      return { id: secret.id, name };
    } catch (err: any) {
      throw new BadRequestException(`Failed to create secret: ${err.message}`);
    }
  }

  async deleteSecret(endpointId: string, secretId: string) {
    const docker = endpointId === 'local' ? this.dockerService.getLocalConnection() : await this.dockerService.getConnection(endpointId);
    try {
      const secret = (docker as any).getSecret(secretId);
      await secret.remove();
      return { message: 'Secret deleted' };
    } catch (err: any) {
      throw new BadRequestException(`Failed to delete secret: ${err.message}`);
    }
  }
}
