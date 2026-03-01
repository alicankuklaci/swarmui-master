import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeamDocument = Team & Document;

@Schema({ timestamps: true, collection: 'teams' })
export class Team {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: [{
      userId: { type: Types.ObjectId, ref: 'User', required: true },
      role: { type: String, enum: ['leader', 'member'], default: 'member' },
      joinedAt: { type: Date, default: () => new Date() },
    }],
    default: [],
  })
  members: Array<{ userId: Types.ObjectId; role: string; joinedAt: Date }>;
}

export const TeamSchema = SchemaFactory.createForClass(Team);
