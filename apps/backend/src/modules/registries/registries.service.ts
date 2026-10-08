import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';
import { Registry, RegistryDocument } from './schemas/registry.schema';
import { CreateRegistryDto, UpdateRegistryDto } from './dto/registry.dto';
import { encrypt, decrypt } from '../../common/utils/crypto.util';

const DOCKERHUB_API = 'https://hub.docker.com';

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
      const password = this.getPassword(registry);

      if (this.isDockerHub(registry)) {
        if (!registry.username || !password) {
          return { success: false, message: 'Docker Hub requires username and PAT' };
        }
        const jwt = await this.dockerHubLogin(registry.username, password);
        return jwt
          ? { success: true, message: 'Authentication successful (Docker Hub)' }
          : { success: false, message: 'Docker Hub auth failed — use a Personal Access Token (hub.docker.com/settings/security), not your account password' };
      }

      // Generic Docker Registry v2 (self-hosted, GitLab, Harbor, ...)
      const url = new URL(`${registry.url}/v2/`);
      const result = await this.httpGet(url.href, registry.username, password);

      if (result.status === 200) {
        return { success: true, message: 'Authentication successful' };
      }
      if (result.status === 401) {
        // Try bearer-token flow if Www-Authenticate indicates it
        const challenge = result.headers?.['www-authenticate'] as string | undefined;
        if (challenge && /bearer/i.test(challenge)) {
          const scope = this.parseBearerChallenge(challenge);
          if (scope?.realm) {
            const token = await this.fetchBearerToken(scope.realm, scope.service, '', registry.username, password);
            if (token) {
              const authResult = await this.httpGet(url.href, undefined, undefined, false, token);
              if (authResult.status === 200) {
                return { success: true, message: 'Authentication successful (Bearer)' };
              }
              return { success: false, message: `Auth failed: HTTP ${authResult.status}` };
            }
          }
        }
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

    const password = this.getPassword(registry);

    if (this.isDockerHub(registry)) {
      if (!registry.username) return [];
      const jwt = await this.dockerHubLogin(registry.username, password);
      // Hub API lists user/org repositories. Returns `<username>/<name>` so callers can use the full ref.
      const repos: string[] = [];
      let next: string | null = `${DOCKERHUB_API}/v2/repositories/${encodeURIComponent(registry.username)}/?page_size=100`;
      while (next) {
        const res = await this.httpGetJson(next, jwt ? { Authorization: `JWT ${jwt}` } : undefined);
        for (const r of res?.results ?? []) {
          if (r.namespace && r.name) repos.push(`${r.namespace}/${r.name}`);
        }
        next = res?.next ?? null;
      }
      return repos;
    }

    const url = `${registry.url}/v2/_catalog`;
    const result = await this.httpGet(url, registry.username, password, true);
    const body = this.safeJson(result.body);
    return body?.repositories ?? [];
  }

  async getTags(id: string, imageName: string): Promise<string[]> {
    const registry = await this.registryModel.findById(id).lean();
    if (!registry) throw new NotFoundException(`Registry ${id} not found`);

    const password = this.getPassword(registry);

    if (this.isDockerHub(registry)) {
      // Strip library/ prefix for official images (nginx → library/nginx on API, but hub.docker.com wants nginx)
      const name = imageName.includes('/') ? imageName : `library/${imageName}`;
      const tags: string[] = [];
      const jwt = registry.username && password ? await this.dockerHubLogin(registry.username, password) : null;
      let next: string | null = `${DOCKERHUB_API}/v2/repositories/${name}/tags/?page_size=100`;
      while (next) {
        const res = await this.httpGetJson(next, jwt ? { Authorization: `JWT ${jwt}` } : undefined);
        for (const t of res?.results ?? []) {
          if (t.name) tags.push(t.name);
        }
        next = res?.next ?? null;
      }
      return tags;
    }

    const url = `${registry.url}/v2/${imageName}/tags/list`;
    const result = await this.httpGet(url, registry.username, password, true);
    const body = this.safeJson(result.body);
    return body?.tags ?? [];
  }

  // --- Helpers ---------------------------------------------------------------

  private isDockerHub(registry: any): boolean {
    if (registry?.type === 'dockerhub') return true;
    const u = (registry?.url ?? '').toLowerCase();
    return u.includes('registry-1.docker.io') || u.includes('index.docker.io') || u.includes('hub.docker.com');
  }

  private getPassword(registry: any): string {
    return registry?.passwordEncrypted ? decrypt(registry.passwordEncrypted, this.secret) : '';
  }

  private async dockerHubLogin(username: string, password: string): Promise<string | null> {
    try {
      const res = await this.httpRequest({
        method: 'POST',
        url: `${DOCKERHUB_API}/v2/users/login/`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.status !== 200) return null;
      const body = this.safeJson(res.body);
      return body?.token ?? null;
    } catch (err: any) {
      this.logger.warn(`Docker Hub login failed: ${err?.message ?? err}`);
      return null;
    }
  }

  private parseBearerChallenge(header: string): { realm?: string; service?: string; scope?: string } {
    const out: any = {};
    const re = /(realm|service|scope)="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(header)) !== null) out[m[1]] = m[2];
    return out;
  }

  private async fetchBearerToken(
    realm: string,
    service: string | undefined,
    scope: string,
    username?: string,
    password?: string,
  ): Promise<string | null> {
    try {
      const u = new URL(realm);
      if (service) u.searchParams.set('service', service);
      if (scope) u.searchParams.set('scope', scope);
      const res = await this.httpGet(u.href, username, password, !!(username && password));
      if (res.status !== 200) return null;
      const body = this.safeJson(res.body);
      return body?.token ?? body?.access_token ?? null;
    } catch {
      return null;
    }
  }

  private safeJson(s: string): any {
    try { return JSON.parse(s); } catch { return null; }
  }

  private httpGet(
    url: string,
    username?: string,
    password?: string,
    withAuth = false,
    bearer?: string,
  ): Promise<{ status: number; body: string; headers: any }> {
    const headers: any = {};
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`;
    } else if (username && (withAuth || !password)) {
      const auth = Buffer.from(`${username}:${password ?? ''}`).toString('base64');
      headers.Authorization = `Basic ${auth}`;
    } else if (username && password && withAuth) {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      headers.Authorization = `Basic ${auth}`;
    }
    return this.httpRequest({ method: 'GET', url, headers });
  }

  private async httpGetJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    const res = await this.httpRequest({ method: 'GET', url, headers });
    return this.safeJson(res.body);
  }

  private httpRequest(opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; body: string; headers: any }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(opts.url);
      const options: any = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: opts.method,
        rejectUnauthorized: false,
        headers: { ...(opts.headers ?? {}) },
      };
      if (opts.body) options.headers['Content-Length'] = Buffer.byteLength(opts.body).toString();

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const req = client.request(options, (res: any) => {
        let body = '';
        res.on('data', (d: Buffer) => (body += d.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers ?? {} }));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  private sanitize(r: any) {
    const { passwordEncrypted, ...rest } = r;
    return rest;
  }
}
