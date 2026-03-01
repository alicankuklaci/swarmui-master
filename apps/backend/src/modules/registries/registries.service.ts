import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';
import { Registry, RegistryDocument } from './schemas/registry.schema';
import { CreateRegistryDto, UpdateRegistryDto } from './dto/registry.dto';
import { encrypt, decrypt } from '../../common/utils/crypto.util';

@Injectable()
export class RegistriesService {
  private readonly logger = new Logger(RegistriesService.name);
  private readonly secret: string;

  constructor(
    @InjectModel(Registry.name) private readonly registryModel: Model<RegistryDocument>,
    private readonly config: ConfigService,
  ) {
    this.secret = this.config.get<string>('ENCRYPTION_SECRET', 'swarmui-secret-key');
  }

  async findAll() {
    const registries = await this.registryModel.find().lean();
    return registries.map((r) => this.sanitize(r));
  }

  async findOne(id: string) {
    const registry = await this.registryModel.findById(id).lean();
    if (!registry) throw new NotFoundException(`Registry ${id} not found`);
    return this.sanitize(registry);
  }

  async create(dto: CreateRegistryDto) {
    const data: any = {
      name: dto.name,
      type: dto.type,
      url: dto.url,
      username: dto.username ?? '',
      authentication: dto.authentication ?? false,
      accessList: dto.accessList ?? [],
    };
    if (dto.password) {
      data.passwordEncrypted = encrypt(dto.password, this.secret);
    }
    const registry = new this.registryModel(data);
    const saved = await registry.save();
    return this.sanitize(saved.toObject());
  }

  async update(id: string, dto: UpdateRegistryDto) {
    const registry = await this.registryModel.findById(id);
    if (!registry) throw new NotFoundException(`Registry ${id} not found`);

    if (dto.name !== undefined) registry.name = dto.name;
    if (dto.url !== undefined) registry.url = dto.url;
    if (dto.username !== undefined) registry.username = dto.username;
    if (dto.authentication !== undefined) registry.authentication = dto.authentication;
    if (dto.accessList !== undefined) registry.accessList = dto.accessList;
    if (dto.password !== undefined) {
      registry.passwordEncrypted = encrypt(dto.password, this.secret);
    }

    const saved = await registry.save();
    return this.sanitize(saved.toObject());
  }

  async remove(id: string) {
    const registry = await this.registryModel.findByIdAndDelete(id);
    if (!registry) throw new NotFoundException(`Registry ${id} not found`);
    return { message: 'Registry deleted' };
  }

  async testAuth(id: string): Promise<{ success: boolean; message: string }> {
    const registry = await this.registryModel.findById(id).lean();
    if (!registry) throw new NotFoundException(`Registry ${id} not found`);

    try {
      const password = registry.passwordEncrypted
        ? decrypt(registry.passwordEncrypted, this.secret)
        : '';

      const url = new URL(`${registry.url}/v2/`);
      const result = await this.httpGet(url.href, registry.username, password);

      if (result.status === 200 || result.status === 401) {
        // 401 means auth is required but endpoint is reachable
        if (result.status === 200) {
          return { success: true, message: 'Authentication successful' };
        }
        // Try with credentials
        const authResult = await this.httpGet(url.href, registry.username, password, true);
        if (authResult.status === 200) {
          return { success: true, message: 'Authentication successful' };
        }
        return { success: false, message: `Auth failed: HTTP ${authResult.status}` };
      }
      return { success: false, message: `Unexpected status: ${result.status}` };
    } catch (err: any) {
      return { success: false, message: err.message ?? 'Connection failed' };
    }
  }

  async getCatalog(id: string): Promise<string[]> {
    const registry = await this.registryModel.findById(id).lean();
    if (!registry) throw new NotFoundException(`Registry ${id} not found`);

    const password = registry.passwordEncrypted
      ? decrypt(registry.passwordEncrypted, this.secret)
      : '';

    const url = `${registry.url}/v2/_catalog`;
    const result = await this.httpGet(url, registry.username, password);
    const body = JSON.parse(result.body);
    return body.repositories ?? [];
  }

  async getTags(id: string, imageName: string): Promise<string[]> {
    const registry = await this.registryModel.findById(id).lean();
    if (!registry) throw new NotFoundException(`Registry ${id} not found`);

    const password = registry.passwordEncrypted
      ? decrypt(registry.passwordEncrypted, this.secret)
      : '';

    const url = `${registry.url}/v2/${imageName}/tags/list`;
    const result = await this.httpGet(url, registry.username, password);
    const body = JSON.parse(result.body);
    return body.tags ?? [];
  }

  private httpGet(
    url: string,
    username?: string,
    password?: string,
    withAuth = false,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options: any = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        rejectUnauthorized: false,
      };

      if (username && (withAuth || !password)) {
        const auth = Buffer.from(`${username}:${password ?? ''}`).toString('base64');
        options.headers = { Authorization: `Basic ${auth}` };
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const req = client.request(options, (res: any) => {
        let body = '';
        res.on('data', (d: Buffer) => (body += d.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  private sanitize(r: any) {
    const { passwordEncrypted, ...rest } = r;
    return rest;
  }
}
