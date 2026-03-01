import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './schemas/settings.schema';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(@InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>) {}

  async onModuleInit() {
    const count = await this.settingsModel.countDocuments();
    if (count === 0) {
      await this.settingsModel.create({});
    }
  }

  async getSettings() {
    return this.settingsModel.findOne().lean();
  }

  async updateSettings(dto: Partial<Settings>) {
    return this.settingsModel.findOneAndUpdate({}, dto, { new: true, upsert: true }).lean();
  }
}
