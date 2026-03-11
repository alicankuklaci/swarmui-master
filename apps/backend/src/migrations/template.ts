import { Connection } from 'mongoose';

export const version = '0000000000_template';
export const description = 'Describe what this migration does';

export async function up(db: Connection): Promise<void> {
  // Example: add a new field with a default value
  // await db.collection('users').updateMany(
  //   { newField: { $exists: false } },
  //   { $set: { newField: 'default' } }
  // );
}

export async function down(db: Connection): Promise<void> {
  // Rollback logic
  // await db.collection('users').updateMany(
  //   {},
  //   { $unset: { newField: '' } }
  // );
}
