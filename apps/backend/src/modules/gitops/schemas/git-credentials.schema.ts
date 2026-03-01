import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GitCredentialsDocument = GitCredentials & Document;

@Schema({ timestamps: true })
export class GitCredentials {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['pat', 'ssh'] })
  type: string;

  @Prop({ default: '' })
  username: string;

  @Prop({ default: '' })
  tokenEncrypted: string;

  @Prop({ default: '' })
  sshKeyEncrypted: string;

  @Prop({ default: '' })
  description: string;
}

export const GitCredentialsSchema = SchemaFactory.createForClass(GitCredentials);
