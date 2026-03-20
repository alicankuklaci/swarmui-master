import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class StackFile extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [{ key: String, value: String }], default: [] })
  envVars: { key: string; value: string }[];

  @Prop()
  updatedAt: Date;
}

export const StackFileSchema = SchemaFactory.createForClass(StackFile);
