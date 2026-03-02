import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  private async seedAdminUser() {
    const count = await this.userModel.countDocuments();
    if (count === 0) {
      const hashedPassword = await bcrypt.hash('root', this.SALT_ROUNDS);
      await this.userModel.create({
        username: 'root',
        email: 'root@swarmui.local',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        forceChangePassword: true,
      });
      this.logger.log('Default admin user created: root / root');
    }
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const filter: any = {};
    if (search) {
      filter.$or = [
        { username: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }
    const [data, total] = await Promise.all([
      this.userModel.find(filter).select('-password').skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean(),
      this.userModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const user = await this.userModel.findById(id).select('-password').lean();
    if (!user) throw new NotFoundException(`User not found`);
    return user;
  }

  async findByUsername(username: string) {
    return this.userModel.findOne({ username }).select('+password').lean();
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userModel.findOne({
      $or: [{ username: dto.username }, { email: dto.email }],
    });
    if (existing) throw new ConflictException('Username or email already exists');

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);
    const user = await this.userModel.create({ ...dto, password: hashedPassword });
    const { password: _, ...result } = user.toObject();
    return result;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.userModel.findByIdAndUpdate(id, dto, { new: true }).select('-password').lean();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async delete(id: string) {
    const user = await this.userModel.findByIdAndDelete(id);
    if (!user) throw new NotFoundException('User not found');
    return { message: 'User deleted successfully' };
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(id).select('+password');
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    user.password = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);
    user.forceChangePassword = false;
    await user.save();
    return { message: 'Password changed successfully' };
  }

  async resetPassword(id: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    const user = await this.userModel.findByIdAndUpdate(id, {
      password: hashedPassword,
      forceChangePassword: true,
    }, { new: true });
    if (!user) throw new NotFoundException('User not found');
    return { message: 'Password reset successfully' };
  }
}
