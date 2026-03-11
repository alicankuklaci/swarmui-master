/**
 * Migration Runner
 * Runs pending migrations in order and tracks them in the `migrations` collection.
 */
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/swarmui';

async function run() {
  const db = await mongoose.createConnection(MONGO_URI).asPromise();
  const col = db.collection('_migrations');

  const applied = new Set(
    (await col.find({}).toArray()).map((m: any) => m.version),
  );

  // Dynamically load migration files (exclude template and this runner)
  const fs = require('fs');
  const path = require('path');
  const files = fs
    .readdirSync(__dirname)
    .filter(
      (f: string) =>
        f.endsWith('.ts') &&
        !f.includes('template') &&
        !f.includes('runner') &&
        !f.includes('README'),
    )
    .sort();

  for (const file of files) {
    const migration = require(path.join(__dirname, file));
    if (applied.has(migration.version)) {
      console.log(`⏭  Skipping: ${migration.version}`);
      continue;
    }
    console.log(`⬆️  Running: ${migration.version} — ${migration.description}`);
    await migration.up(db);
    await col.insertOne({ version: migration.version, appliedAt: new Date() });
    console.log(`✅  Done: ${migration.version}`);
  }

  await db.close();
  console.log('All migrations complete.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
