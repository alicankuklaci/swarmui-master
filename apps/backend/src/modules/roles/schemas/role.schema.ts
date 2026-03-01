import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoleDocument = Role & Document;

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: false })
  isBuiltin: boolean;

  @Prop({
    type: [{
      resource: { type: String, required: true },
      actions: [{ type: String }],
    }],
    default: [],
  })
  permissions: Array<{ resource: string; actions: string[] }>;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
