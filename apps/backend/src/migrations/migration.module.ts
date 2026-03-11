import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MigrationService } from './migration.service';

@Module({
  imports: [MongooseModule.forFeature([])],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationModule {}
