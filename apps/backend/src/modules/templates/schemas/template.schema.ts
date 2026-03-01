import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TemplateDocument = Template & Document;

export class TemplateEnvVar {
  name: string;
  label: string;
  description?: string;
  default?: string;
  required?: boolean;
}

export class TemplatePort {
  host?: number;
  container: number;
  protocol?: string;
}

export class TemplateVolume {
  bind?: string;
  container: string;
  readonly?: boolean;
}

@Schema({ timestamps: true })
export class Template {
  @Prop({ required: true, enum: ['container', 'swarm-service', 'stack'] })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  logo: string;

  @Prop({ default: '' })
  image: string;

  @Prop({ default: '' })
  composeContent: string;

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ type: [Object], default: [] })
  env: TemplateEnvVar[];

  @Prop({ type: [Object], default: [] })
  ports: TemplatePort[];

  @Prop({ type: [Object], default: [] })
  volumes: TemplateVolume[];

  @Prop({ default: false })
  isBuiltin: boolean;

  @Prop({ default: true })
  isPublic: boolean;

  @Prop({ default: '' })
  note: string;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
