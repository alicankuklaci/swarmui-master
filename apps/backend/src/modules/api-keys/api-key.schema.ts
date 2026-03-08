import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyScope = 'read' | 'write' | 'admin';

export type ApiKeyDocument = ApiKey & Document;

@Schema({ timestamps: true, collection: 'api_keys' })
export class ApiKey {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, select: false })
  keyHash: string;

  @Prop({ required: true })
  keyPrefix: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, type: [String], enum: ['read', 'write', 'admin'] })
  scope: ApiKeyScope[];

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: Date, default: null })
  lastUsedAt: Date | null;

  @Prop({ default: true })
  active: boolean;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

ApiKeySchema.index({ keyPrefix: 1 });
ApiKeySchema.index({ userId: 1 });
