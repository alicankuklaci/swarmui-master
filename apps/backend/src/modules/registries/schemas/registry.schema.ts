import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RegistryDocument = Registry & Document;

@Schema({ timestamps: true })
export class Registry {
  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: ['dockerhub', 'gcr', 'ecr', 'acr', 'gitlab', 'quay', 'custom'],
  })
  type: string;

  @Prop({ required: true })
  url: string;

  @Prop({ default: '' })
  username: string;

  @Prop({ default: '' })
  passwordEncrypted: string;

  @Prop({ default: false })
  authentication: boolean;

  @Prop({ type: [String], default: [] })
  accessList: string[];
}

export const RegistrySchema = SchemaFactory.createForClass(Registry);
