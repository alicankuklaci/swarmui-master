import { Connection } from 'mongoose';

export const version = '20260309000000_initial_indexes';
export const description = 'Add indexes for faster lookups on endpoints, apikeys, activitylogs';

export async function up(db: Connection): Promise<void> {
  const ops = [
    db.collection('endpoints').createIndex({ name: 1 }),
    db.collection('apikeys').createIndex({ keyPrefix: 1 }),
    db.collection('activitylogs').createIndex({ createdAt: -1 }),
  ];
  await Promise.allSettled(ops); // ignore duplicate index errors
}

export async function down(db: Connection): Promise<void> {
  await Promise.allSettled([
    db.collection('endpoints').dropIndex('name_1'),
    db.collection('apikeys').dropIndex('keyPrefix_1'),
    db.collection('activitylogs').dropIndex('createdAt_-1'),
  ]);
}
