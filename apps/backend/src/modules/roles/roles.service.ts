import { Injectable, NotFoundException, ConflictException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';

const BUILTIN_ROLES = [
  {
    name: 'administrator',
    description: 'Full access to all resources',
    isBuiltin: true,
    permissions: [{ resource: '*', actions: ['*'] }],
  },
  {
    name: 'operator',
    description: 'Manage containers and services',
    isBuiltin: true,
    permissions: [
      { resource: 'containers', actions: ['read', 'create', 'update', 'delete', 'exec'] },
      { resource: 'services', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'images', actions: ['read', 'pull', 'delete'] },
      { resource: 'volumes', actions: ['read', 'create', 'delete'] },
      { resource: 'networks', actions: ['read', 'create', 'delete'] },
    ],
  },
  {
    name: 'helpdesk',
    description: 'View logs and restart containers',
    isBuiltin: true,
    permissions: [
      { resource: 'containers', actions: ['read', 'restart', 'logs'] },
      { resource: 'services', actions: ['read', 'logs'] },
    ],
  },
  {
    name: 'standard',
    description: 'Manage own containers',
    isBuiltin: true,
    permissions: [
      { resource: 'containers', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'images', actions: ['read', 'pull'] },
      { resource: 'volumes', actions: ['read', 'create'] },
    ],
  },
  {
    name: 'readonly',
    description: 'Read-only access',
    isBuiltin: true,
    permissions: [
      { resource: 'containers', actions: ['read', 'logs'] },
      { resource: 'services', actions: ['read'] },
      { resource: 'images', actions: ['read'] },
      { resource: 'volumes', actions: ['read'] },
      { resource: 'networks', actions: ['read'] },
    ],
  },
];

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(@InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>) {}

  async onModuleInit() {
    for (const role of BUILTIN_ROLES) {
      await this.roleModel.findOneAndUpdate({ name: role.name }, role, { upsert: true });
    }
    this.logger.log('Built-in roles seeded');
  }

  async findAll() {
    return this.roleModel.find().sort({ isBuiltin: -1, name: 1 }).lean();
  }

  async findById(id: string) {
    const role = await this.roleModel.findById(id).lean();
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: any) {
    const existing = await this.roleModel.findOne({ name: dto.name });
    if (existing) throw new ConflictException('Role name already exists');
    return this.roleModel.create({ ...dto, isBuiltin: false });
  }

  async update(id: string, dto: any) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('Role not found');
    if (role.isBuiltin) throw new BadRequestException('Cannot modify built-in roles');
    const updated = await this.roleModel.findByIdAndUpdate(id, dto, { new: true }).lean();
    return updated;
  }

  async delete(id: string) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('Role not found');
    if (role.isBuiltin) throw new BadRequestException('Cannot delete built-in roles');
    await this.roleModel.findByIdAndDelete(id);
    return { message: 'Role deleted successfully' };
  }
}
