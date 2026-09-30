import { randomUUID } from 'node:crypto';
import { cardToString, createDeck, parseCards } from '@holdem/poker-engine';
import type { Card } from '@holdem/poker-engine';
import type { AppConfig } from '../../src/config/config.js';
import type { Db } from '../../src/infra/db/db.js';
import { migrate } from '../../src/infra/db/migrate.js';
import { PgDb } from '../../src/infra/db/pg-db.js';
import type { DeckSource } from '../../src/modules/table-runtime/fairness.js';
import { WalletService } from '../../src/modules/wallet/wallet.service.js';
import { PGliteDb } from './pglite-db.js';

export const TEST_CONFIG: AppConfig = {
  jwtSecret: 'test-secret-test-secret-test-secret-12345',
  accessTokenTtlSeconds: 900,
  wsTicketTtlSeconds: 30,
  welcomeBonus: 10_000n,
  handStartDelayMs: 10,
  outboxPollMs: 0,
};

/**
 * In-process Postgres by default. Set TEST_DATABASE_URL to run against a real database that is used for
 * nothing else (e.g. holdem_test): its public schema is dropped first, so run with --no-file-parallelism.
 */
export async function createTestDb(): Promise<Db> {
  const url = process.env['TEST_DATABASE_URL'];
  let db: Db;
  if (url) {
    db = new PgDb(url);
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  } else {
    db = new PGliteDb();
  }
  await migrate(db);
  return db;
}

/** A full deck whose first cards are `top`, so tests control exactly what is dealt. */
export function stackedDeck(top: string): Card[] {
  const head = parseCards(top);
  const used = new Set(head.map(cardToString));
  return [...head, ...createDeck().filter((c) => !used.has(cardToString(c)))];
}

/** Deals the given scripted decks in order, then falls back to the last one. */
export function scriptedDecks(...tops: string[]): DeckSource {
  let i = 0;
  return () => ({ deck: stackedDeck(tops[Math.min(i++, tops.length - 1)]!), salt: `salt-${i}` });
}

export async function createUser(
  db: Db,
  wallet: WalletService,
  username: string,
  balance = 10_000n,
): Promise<{ userId: string; username: string }> {
  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO users (id, username, password_hash) VALUES ($1, $2, 'x')`, [userId, username]);
    await wallet.openUserAccount(tx, userId);
    await wallet.transfer(tx, {
      kind: 'bonus',
      from: { type: 'house' },
      to: { type: 'user', id: userId },
      amount: balance,
      idempotencyKey: `test-grant:${userId}`,
    });
  });
  return { userId, username };
}

/** Ledger invariants that must hold at rest: balanced entries, zero-sum accounts, table escrow equals seat stacks. */
export async function assertLedgerConsistent(db: Db): Promise<void> {
  const unbalanced = await db.query(
    `SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount) <> 0`,
  );
  if (unbalanced.rowCount > 0) throw new Error('Unbalanced ledger transaction');

  const total = await db.query<{ s: string }>(`SELECT COALESCE(SUM(balance), 0)::text AS s FROM accounts`);
  if (total.rows[0]!.s !== '0') throw new Error(`Accounts do not sum to zero: ${total.rows[0]!.s}`);

  const escrow = await db.query<{ table_id: string; balance: string; stacks: string }>(
    `SELECT a.owner_id AS table_id, a.balance::text AS balance,
            COALESCE((SELECT SUM(stack) FROM table_seats s WHERE s.table_id = a.owner_id), 0)::text AS stacks
       FROM accounts a WHERE a.owner_type = 'table'`,
  );
  for (const row of escrow.rows) {
    if (row.balance !== row.stacks) throw new Error(`Table ${row.table_id} escrow ${row.balance} != stacks ${row.stacks}`);
  }
}
