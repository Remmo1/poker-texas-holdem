import type { Db } from './db.js';
import { migrations } from './migrations.js';

export async function migrate(db: Db): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied: string[] = [];

  for (const migration of migrations) {
    await db.transaction(async (tx) => {
      // Serialize concurrent boots; the lock is released at commit.
      await tx.query('SELECT pg_advisory_xact_lock(727001)');
      const done = await tx.query('SELECT 1 FROM schema_migrations WHERE name = $1', [migration.name]);
      if (done.rowCount > 0) return;
      await tx.exec(migration.sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
      applied.push(migration.name);
    });
  }
  return applied;
}
