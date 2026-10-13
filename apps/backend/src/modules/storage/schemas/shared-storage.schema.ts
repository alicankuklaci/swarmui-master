import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  STORAGE_BACKENDS,
  STORAGE_STATES,
  type StorageBackend,
  type StorageState,
} from '@swarmui-master/storage-plan';

export type SharedStorageDocument = SharedStorage & Document;

// A singleton document — only one shared-storage install per swarm. The
// controller enforces that at the service layer; the schema just models the
// shape. The _id is a stable string ("primary") so lookups are deterministic.
// Without the String _id override Mongoose casts to ObjectId and every
// findById('primary') throws CastError.
@Schema({ timestamps: true, collection: 'shared_storage', _id: false })
export class SharedStorage {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true, enum: STORAGE_BACKENDS })
  backend: StorageBackend;

  // Mirrors `backend` for now, but reserved so a v2 CSI driver swap is a value
  // change, not a schema migration.
  @Prop({ type: String, required: true })
  driver: string;

  @Prop({ type: [String], required: true })
  nodes: string[];

  @Prop({ type: String, required: true, default: '/var/lib/swarmui/shared' })
  mountPoint: string;

  @Prop({ type: String, required: true, enum: STORAGE_STATES, default: 'PENDING' })
  state: StorageState;

  // Last plan step the state machine finished. On backend restart the installer
  // resumes from the step *after* this id, instead of starting over.
  @Prop({ type: String })
  lastAttemptedStepId?: string;

  // Opaque per-install session id. Also used as HMAC input for node-exec calls.
  @Prop({ type: String })
  installSessionId?: string;

  // Driver-specific knobs (replication=010, filer port, nfs server node, …).
  // Opaque to storage-core; interpreted by the driver.
  @Prop({ type: Object })
  driverOpts?: Record<string, unknown>;

  // Last reconciler check — nullable until the health reconciler ships (S5).
  @Prop()
  lastHealthCheckAt?: Date;

  // Snapshot of the consumer set at the last reconciler tick. Drift
  // detection compares the current set against this one and emits an
  // event when it changes. Nullable so the first-ever tick doesn't fire
  // a spurious "N services appeared" alert.
  @Prop({ type: [String] })
  lastKnownConsumers?: string[];

  // ISO timestamp of the last tick that changed lastKnownConsumers.
  @Prop()
  lastConsumerDriftAt?: Date;

  // User who kicked off the current install/uninstall.
  @Prop()
  initiatedBy?: string;
}

export const SharedStorageSchema = SchemaFactory.createForClass(SharedStorage);
