import { Connection } from 'mongoose';

export const version = '20260309000000_initial_indexes';
export const description = 'Add indexes on users.username and endpoints.name for faster lookups';

export async function up(db: Connection): Promise<void> {
  await db.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true });
  await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
  await db.collection('endpoints').createIndex({ name: 1 });
  await db.collection('apikeys').createIndex({ keyPrefix: 1 });
  await db.collection('activitylogs').createIndex({ createdAt: -1 });
}

export async function down(db: Connection): Promise<void> {
  await db.collection('users').dropIndex('username_1');
  await db.collection('users').dropIndex('email_1');
  await db.collection('endpoints').dropIndex('name_1');
  await db.collection('apikeys').dropIndex('keyPrefix_1');
  await db.collection('activitylogs').dropIndex('createdAt_-1');
}
