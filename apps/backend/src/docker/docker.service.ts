import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';

type EndpointType = 'local' | 'tcp' | 'tls' | 'agent';

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);
  private readonly connections = new Map<string, Dockerode>();

  constructor(private readonly config: ConfigService) {}

  async getConnection(endpointId: string, url?: string, type?: EndpointType): Promise<Dockerode> {
    if (this.connections.has(endpointId)) {
      return this.connections.get(endpointId)!;
    }

    const docker = await this.createConnection(url || this.config.get('DOCKER_SOCKET', '/var/run/docker.sock'), type);
    this.connections.set(endpointId, docker);
    return docker;
  }

  getLocalConnection(): Dockerode {
    const socketPath = this.config.get<string>('DOCKER_SOCKET', '/var/run/docker.sock');
    const key = 'local';
    if (!this.connections.has(key)) {
      const docker = new Dockerode({ socketPath });
      this.connections.set(key, docker);
    }
    return this.connections.get(key)!;
  }

  removeConnection(endpointId: string): void {
    this.connections.delete(endpointId);
    this.logger.log(`Removed Docker connection for endpoint ${endpointId}`);
  }

  private async createConnection(url: string, type?: EndpointType): Promise<Dockerode> {
    if (!type || type === 'local') {
      const socketPath = url.replace('unix://', '');
      return new Dockerode({ socketPath });
    }

    if (type === 'tcp' || type === 'agent') {
      const parsed = new URL(url);
      return new Dockerode({
        host: parsed.hostname,
        port: parseInt(parsed.port) || 2375,
        protocol: 'http',
      });
    }

    if (type === 'tls') {
      const parsed = new URL(url);
      return new Dockerode({
        host: parsed.hostname,
        port: parseInt(parsed.port) || 2376,
        protocol: 'https',
      });
    }

    throw new Error(`Unknown endpoint type: ${type}`);
  }
}
