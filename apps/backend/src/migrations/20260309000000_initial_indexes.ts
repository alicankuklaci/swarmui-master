import { Connection } from 'mongoose';

export const version = '20260309000000_initial_indexes';
export const description = 'Add indexes on users.username and endpoints.name for faster lookups';

async function ensureIndex(db: Connection, collection: string, index: object, options: object = {}) {
  try {
    await db.collection(collection).createIndex(index, options);
  } catch (err: any) {
    // Index already exists with same or different options — skip
    if (err.codeName === 'IndexOptionsConflict' || err.codeName === 'IndexKeySpecsConflict' || err.code === 85 || err.code === 86) {
      return; // silently skip
    }
    throw err;
  }
}

export async function up(db: Connection): Promise<void> {
  await ensureIndex(db, 'endpoints', { name: 1 });
  await ensureIndex(db, 'apikeys', { keyPrefix: 1 });
  await ensureIndex(db, 'activitylogs', { createdAt: -1 });
}

export async function down(db: Connection): Promise<void> {
  // Only drop indexes we know we created
  try { await db.collection('endpoints').dropIndex('name_1'); } catch {}
  try { await db.collection('apikeys').dropIndex('keyPrefix_1'); } catch {}
  try { await db.collection('activitylogs').dropIndex('createdAt_-1'); } catch {}
}
