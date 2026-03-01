import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { GitCredentials, GitCredentialsDocument } from './schemas/git-credentials.schema';
import { CreateGitCredentialsDto } from './dto/gitops.dto';
import { encrypt, decrypt } from '../../common/utils/crypto.util';

@Injectable()
export class GitCredentialsService {
  private readonly secret: string;

  constructor(
    @InjectModel(GitCredentials.name) private readonly model: Model<GitCredentialsDocument>,
    private readonly config: ConfigService,
  ) {
    this.secret = this.config.get<string>('ENCRYPTION_SECRET', 'swarmui-secret-key');
  }

  async findAll() {
    const creds = await this.model.find().lean();
    return creds.map((c) => this.sanitize(c));
  }

  async findOne(id: string) {
    const cred = await this.model.findById(id).lean();
    if (!cred) throw new NotFoundException(`Git credentials ${id} not found`);
    return this.sanitize(cred);
  }

  async findOneRaw(id: string): Promise<Record<string, any> | null> {
    const cred = await this.model.findById(id).lean();
    if (!cred) return null;
    return {
      ...cred,
      token: cred.tokenEncrypted ? decrypt(cred.tokenEncrypted, this.secret) : '',
      sshKey: cred.sshKeyEncrypted ? decrypt(cred.sshKeyEncrypted, this.secret) : '',
    };
  }

  async create(dto: CreateGitCredentialsDto) {
    const data: any = {
      name: dto.name,
      type: dto.type,
      username: dto.username ?? '',
      description: dto.description ?? '',
    };
    if (dto.token) data.tokenEncrypted = encrypt(dto.token, this.secret);
    if (dto.sshKey) data.sshKeyEncrypted = encrypt(dto.sshKey, this.secret);
    const cred = new this.model(data);
    const saved = await cred.save();
    return this.sanitize(saved.toObject());
  }

  async remove(id: string) {
    const cred = await this.model.findByIdAndDelete(id);
    if (!cred) throw new NotFoundException(`Git credentials ${id} not found`);
    return { message: 'Git credentials deleted' };
  }

  private sanitize(c: any) {
    const { tokenEncrypted, sshKeyEncrypted, ...rest } = c;
    return rest;
  }
}
