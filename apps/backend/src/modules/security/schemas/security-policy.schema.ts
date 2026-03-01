import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SecurityPolicyDocument = SecurityPolicy & Document;

@Schema({ timestamps: true, collection: 'security_policies' })
export class SecurityPolicy {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  readonlyRootFilesystem: boolean;

  @Prop({ default: false })
  noNewPrivileges: boolean;

  @Prop({ default: false })
  runAsNonRoot: boolean;

  @Prop({ type: Number })
  runAsUser?: number;

  @Prop({ type: [String], default: [] })
  blockedImages: string[];

  @Prop({ type: [String], default: [] })
  allowedRegistries: string[];

  @Prop({ type: [String], default: [] })
  dropCapabilities: string[];

  @Prop({ type: [String], default: [] })
  addCapabilities: string[];

  @Prop({ default: false })
  enableSeccomp: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const SecurityPolicySchema = SchemaFactory.createForClass(SecurityPolicy);
SecurityPolicySchema.index({ name: 1 });
SecurityPolicySchema.index({ isActive: 1 });
