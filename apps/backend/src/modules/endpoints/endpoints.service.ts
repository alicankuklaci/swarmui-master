import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Endpoint, EndpointDocument } from './schemas/endpoint.schema';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class EndpointsService {
  private readonly logger = new Logger(EndpointsService.name);

  constructor(
    @InjectModel(Endpoint.name) private readonly endpointModel: Model<EndpointDocument>,
    private readonly dockerService: DockerService,
  ) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const filter: any = {};
    if (search) filter.name = new RegExp(search, 'i');
    const [data, total] = await Promise.all([
      this.endpointModel.find(filter).skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean(),
      this.endpointModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const endpoint = await this.endpointModel.findById(id).lean();
    if (!endpoint) throw new NotFoundException('Endpoint not found');
    return endpoint;
  }

  async create(dto: CreateEndpointDto) {
    const endpoint = await this.endpointModel.create(dto);
    // Test connection after creation
    try {
      const result = await this.testConnection(endpoint.id);
      if (result.success) {
        await this.endpointModel.findByIdAndUpdate(endpoint.id, {
          status: 'active',
          dockerVersion: result.dockerVersion,
          swarmEnabled: result.swarmEnabled,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to test endpoint ${endpoint.id}: ${err.message}`);
    }
    return this.endpointModel.findById(endpoint.id).lean();
  }

  async update(id: string, dto: UpdateEndpointDto) {
    const endpoint = await this.endpointModel.findByIdAndUpdate(id, dto, { new: true }).lean();
    if (!endpoint) throw new NotFoundException('Endpoint not found');
    return endpoint;
  }

  async delete(id: string) {
    const endpoint = await this.endpointModel.findByIdAndDelete(id);
    if (!endpoint) throw new NotFoundException('Endpoint not found');
    this.dockerService.removeConnection(id);
    return { message: 'Endpoint deleted successfully' };
  }

  async testConnection(id: string) {
    const endpoint = await this.endpointModel.findById(id);
    if (!endpoint) throw new NotFoundException('Endpoint not found');

    try {
      const docker = await this.dockerService.getConnection(id, endpoint.url, endpoint.type as any);
      const info = await docker.info();
      const swarmEnabled = info.Swarm?.LocalNodeState === 'active';
      const dockerVersion = info.ServerVersion;

      await this.endpointModel.findByIdAndUpdate(id, {
        status: 'active',
        dockerVersion,
        swarmEnabled,
      });

      return { success: true, dockerVersion, swarmEnabled };
    } catch (err: any) {
      await this.endpointModel.findByIdAndUpdate(id, { status: 'error' });
      return { success: false, error: err.message };
    }
  }
}
