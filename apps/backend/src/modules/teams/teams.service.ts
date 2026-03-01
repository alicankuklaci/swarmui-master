import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Team, TeamDocument } from './schemas/team.schema';
import { CreateTeamDto, UpdateTeamDto, AddMemberDto } from './dto/create-team.dto';

@Injectable()
export class TeamsService {
  constructor(@InjectModel(Team.name) private readonly teamModel: Model<TeamDocument>) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const filter: any = {};
    if (search) filter.name = new RegExp(search, 'i');
    const [data, total] = await Promise.all([
      this.teamModel.find(filter).populate('members.userId', 'username email').skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean(),
      this.teamModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const team = await this.teamModel.findById(id).populate('members.userId', 'username email').lean();
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async create(dto: CreateTeamDto) {
    const existing = await this.teamModel.findOne({ name: dto.name });
    if (existing) throw new ConflictException('Team name already exists');
    return this.teamModel.create(dto);
  }

  async update(id: string, dto: UpdateTeamDto) {
    const team = await this.teamModel.findByIdAndUpdate(id, dto, { new: true }).lean();
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async delete(id: string) {
    const team = await this.teamModel.findByIdAndDelete(id);
    if (!team) throw new NotFoundException('Team not found');
    return { message: 'Team deleted successfully' };
  }

  async addMember(teamId: string, dto: AddMemberDto) {
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    const userId = new Types.ObjectId(dto.userId);
    const existing = team.members.find((m) => m.userId.equals(userId));
    if (existing) throw new ConflictException('User is already a member');
    team.members.push({ userId, role: dto.role || 'member', joinedAt: new Date() });
    await team.save();
    return team.populate('members.userId', 'username email');
  }

  async removeMember(teamId: string, userId: string) {
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    const index = team.members.findIndex((m) => m.userId.equals(new Types.ObjectId(userId)));
    if (index === -1) throw new BadRequestException('User is not a member');
    team.members.splice(index, 1);
    await team.save();
    return { message: 'Member removed successfully' };
  }

  async updateMemberRole(teamId: string, userId: string, role: 'leader' | 'member') {
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    const member = team.members.find((m) => m.userId.equals(new Types.ObjectId(userId)));
    if (!member) throw new BadRequestException('User is not a member');
    member.role = role;
    await team.save();
    return { message: 'Member role updated' };
  }
}
