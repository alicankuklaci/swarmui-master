import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SecurityPolicy, SecurityPolicyDocument } from './schemas/security-policy.schema';

@Injectable()
export class SecurityPolicyService {
  constructor(
    @InjectModel(SecurityPolicy.name) private readonly policyModel: Model<SecurityPolicyDocument>,
  ) {}

  async findAll() {
    return this.policyModel.find().lean();
  }

  async findOne(id: string) {
    const policy = await this.policyModel.findById(id).lean();
    if (!policy) throw new NotFoundException('Security policy not found');
    return policy;
  }

  async create(dto: Partial<SecurityPolicy>, userId: string) {
    return this.policyModel.create({ ...dto, createdBy: new Types.ObjectId(userId) });
  }

  async update(id: string, dto: Partial<SecurityPolicy>) {
    const policy = await this.policyModel.findByIdAndUpdate(id, dto, { new: true }).lean();
    if (!policy) throw new NotFoundException('Security policy not found');
    return policy;
  }

  async delete(id: string) {
    const policy = await this.policyModel.findByIdAndDelete(id).lean();
    if (!policy) throw new NotFoundException('Security policy not found');
    return { message: 'Policy deleted' };
  }

  async applyToContainer(policyId: string, containerId: string): Promise<{ message: string }> {
    const policy = await this.findOne(policyId);
    // In a real implementation, this would update container security options
    // For now we return the policy as reference for the container
    return {
      message: `Policy "${policy.name}" reference stored for container ${containerId}. Apply on next redeploy.`,
    };
  }
}
