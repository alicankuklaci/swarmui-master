import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Endpoint, EndpointDocument } from '../modules/endpoints/schemas/endpoint.schema';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';

type EndpointType = 'local' | 'tcp' | 'tls' | 'agent';

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);
  private readonly connections = new Map<string, Dockerode>();

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Endpoint.name) private readonly endpointModel: Model<EndpointDocument>,
  ) {}

  async getConnection(endpointId: string, url?: string, type?: EndpointType, token?: string): Promise<Dockerode> {
    if (this.connections.has(endpointId)) {
      return this.connections.get(endpointId)!;
    }

    if (!url || !type) {
      const endpoint = await this.endpointModel.findById(endpointId).lean();
      if (endpoint) {
        url = endpoint.url;
        type = endpoint.type as any;
        token = endpoint.agentToken;
      }
    }
    const docker = await this.createConnection(url || this.config.get('DOCKER_SOCKET', '/var/run/docker.sock'), type, token);
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

  private async createConnection(url: string, type?: EndpointType, token?: string): Promise<Dockerode> {
    if (!type || type === 'local') {
      const socketPath = url.replace('unix://', '');
      return new Dockerode({ socketPath });
    }

    if (type === 'tcp' || type === 'agent') {
      const parsed = new URL(url);
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      let host = parsed.hostname;
      if (host === '127.0.0.1' || host === 'localhost') {
        host = 'swarmui-agent_swarmui-agent';
      }
      return new Dockerode({
        host,
        port: parseInt(parsed.port) || 2375,
        protocol: parsed.protocol === 'https:' ? 'https' : 'http',
        headers,
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
