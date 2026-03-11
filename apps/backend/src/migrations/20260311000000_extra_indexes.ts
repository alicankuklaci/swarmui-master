import { Connection } from 'mongoose';

export const version = '20260311000000_extra_indexes';
export const description = 'Add performance indexes on endpoints, apikeys, activitylogs';

export async function up(db: Connection): Promise<void> {
  // Use background index creation, ignore if already exists
  const collections = [
    { name: 'endpoints',    index: { name: 1 },        opts: { background: true } },
    { name: 'apikeys',      index: { keyPrefix: 1 },   opts: { background: true } },
    { name: 'activitylogs', index: { createdAt: -1 },  opts: { background: true } },
  ];
  for (const c of collections) {
    try {
      await (db.collection(c.name) as any).createIndex(c.index, c.opts);
    } catch {
      // Index already exists — skip silently
    }
  }
}

export async function down(db: Connection): Promise<void> {
  for (const [col, idx] of [
    ['endpoints', 'name_1'],
    ['apikeys', 'keyPrefix_1'],
    ['activitylogs', 'createdAt_-1'],
  ] as [string, string][]) {
    try { await db.collection(col).dropIndex(idx); } catch {}
  }
}
