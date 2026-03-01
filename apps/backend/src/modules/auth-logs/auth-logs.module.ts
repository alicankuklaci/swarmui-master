import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthLog, AuthLogSchema } from './schemas/auth-log.schema';
import { AuthLogsService } from './auth-logs.service';
import { AuthLogsController } from './auth-logs.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AuthLog.name, schema: AuthLogSchema }]),
  ],
  controllers: [AuthLogsController],
  providers: [AuthLogsService],
  exports: [AuthLogsService],
})
export class AuthLogsModule {}
