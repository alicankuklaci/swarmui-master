import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EndpointDocument = Endpoint & Document;
export type EndpointType = 'local' | 'tcp' | 'tls' | 'agent';
export type EndpointStatus = 'active' | 'inactive' | 'error';

@Schema({ timestamps: true, collection: 'endpoints' })
export class Endpoint {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ['local', 'tcp', 'tls', 'agent'], default: 'local' })
  type: EndpointType;

  @Prop({ required: true })
  url: string;

  @Prop({ type: String, enum: ['active', 'inactive', 'error'], default: 'inactive' })
  status: EndpointStatus;

  @Prop()
  dockerVersion?: string;

  @Prop({ default: false })
  swarmEnabled: boolean;

  @Prop()
  agentToken?: string;

  @Prop()
  groupId?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({
    type: {
      caCert: String,
      cert: String,
      key: String,
    },
  })
  tls?: { caCert?: string; cert?: string; key?: string };
}

export const EndpointSchema = SchemaFactory.createForClass(Endpoint);
