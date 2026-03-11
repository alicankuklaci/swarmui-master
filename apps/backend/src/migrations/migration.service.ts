import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

interface MigrationRecord {
  version: string;
  appliedAt: Date;
}

export interface Migration {
  version: string;
  description: string;
  up: (db: Connection) => Promise<void>;
  down: (db: Connection) => Promise<void>;
}

@Injectable()
export class MigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap() {
    await this.runMigrations();
  }

  async runMigrations(): Promise<void> {
    const col = this.connection.collection('_migrations');

    // Applied migration listesi
    const applied = new Set<string>(
      (await col.find({}).toArray()).map((m: any) => m.version),
    );

    // Migration dosyalarını bul (template ve runner hariç)
    const migrationsDir = __dirname;
    const files = fs
      .readdirSync(migrationsDir)
      .filter(
        (f) =>
          (f.endsWith('.js') && !f.endsWith('.d.ts')) &&
          !f.includes('template') &&
          !f.includes('runner') &&
          !f.includes('migration.service') &&
          !f.includes('migration.module'),
      )
      .sort();

    let ran = 0;
    for (const file of files) {
      try {
        const migration: Migration = require(path.join(migrationsDir, file));
        if (!migration.version || !migration.up) continue;

        if (applied.has(migration.version)) {
          this.logger.debug(`Skipping migration: ${migration.version}`);
          continue;
        }

        this.logger.log(
          `Running migration: ${migration.version} — ${migration.description}`,
        );
        await migration.up(this.connection);
        await col.insertOne({
          version: migration.version,
          description: migration.description,
          appliedAt: new Date(),
        });
        this.logger.log(`✅ Migration complete: ${migration.version}`);
        ran++;
      } catch (err) {
        this.logger.error(`❌ Migration failed: ${file}`, err);
        throw err; // Başarısız migration → uygulama başlamasın
      }
    }

    if (ran === 0) {
      this.logger.log('No pending migrations.');
    } else {
      this.logger.log(`${ran} migration(s) applied successfully.`);
    }
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    return this.connection
      .collection('_migrations')
      .find({})
      .sort({ appliedAt: 1 })
      .toArray() as unknown as MigrationRecord[];
  }
}
