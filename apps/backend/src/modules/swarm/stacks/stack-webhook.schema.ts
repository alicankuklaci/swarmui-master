import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class StackWebhook extends Document {
  @Prop({ required: true, unique: true }) token: string;
  @Prop({ required: true }) stackName: string;
  @Prop({ required: true }) endpointId: string;
  @Prop() createdBy: string;
}

export const StackWebhookSchema = SchemaFactory.createForClass(StackWebhook);
StackWebhookSchema.index({ token: 1 }, { unique: true });
StackWebhookSchema.index({ stackName: 1, endpointId: 1 });
