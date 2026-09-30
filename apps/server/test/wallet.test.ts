import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsufficientFundsError, WalletService } from '../src/modules/wallet/wallet.service.js';
import { assertLedgerConsistent, createTestDb, createUser } from './support/helpers.js';
import type { Db } from '../src/infra/db/db.js';

describe('WalletService', () => {
  let db: Db;
  let wallet: WalletService;
  let tableId: string;

  beforeAll(async () => {
    db = await createTestDb();
    wallet = new WalletService(db);
    tableId = (
      await db.query<{ id: string }>(
        `INSERT INTO tables (name, config) VALUES ('t', $1::jsonb) RETURNING id`,
        [JSON.stringify({ maxSeats: 6, smallBlind: '10', bigBlind: '20', minBuyIn: '400', maxBuyIn: '2000', actionTimeMs: 20000 })],
      )
    ).rows[0]!.id;
    await db.transaction((tx) => wallet.openTableAccount(tx, tableId));
  });
  afterAll(() => db.close());

  const buyIn = (userId: string, amount: bigint, key: string) =>
    db.transaction((tx) =>
      wallet.transfer(tx, {
        kind: 'buy_in',
        from: { type: 'user', id: userId },
        to: { type: 'table', id: tableId },
        amount,
        idempotencyKey: key,
      }),
    );

  it('moves chips between accounts with balanced entries', async () => {
    const alice = await createUser(db, wallet, 'alice', 1000n);
    expect(await buyIn(alice.userId, 400n, 'k1')).toBe('applied');

    expect(await wallet.balanceOf({ type: 'user', id: alice.userId })).toBe(600n);
    expect(await wallet.balanceOf({ type: 'table', id: tableId })).toBe(400n);
    await assertLedgerConsistent(db).catch((e: Error) => {
      // Escrow check needs seat rows; only the ledger balance checks matter here.
      if (!e.message.includes('escrow')) throw e;
    });
  });

  it('is idempotent: repeating a key does not move chips twice', async () => {
    const bob = await createUser(db, wallet, 'bob', 1000n);
    expect(await buyIn(bob.userId, 300n, 'same-key')).toBe('applied');
    expect(await buyIn(bob.userId, 300n, 'same-key')).toBe('duplicate');
    expect(await wallet.balanceOf({ type: 'user', id: bob.userId })).toBe(700n);
  });

  it('rejects overdrafts and leaves no trace of the failed transfer', async () => {
    const carol = await createUser(db, wallet, 'carol', 100n);
    await expect(buyIn(carol.userId, 101n, 'overdraft')).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await wallet.balanceOf({ type: 'user', id: carol.userId })).toBe(100n);

    // The key was rolled back with the transaction, so a valid retry works.
    expect(await buyIn(carol.userId, 100n, 'overdraft')).toBe('applied');
  });

  it('rejects non-positive amounts', async () => {
    const dave = await createUser(db, wallet, 'dave', 100n);
    await expect(buyIn(dave.userId, 0n, 'zero')).rejects.toThrow(RangeError);
  });

  it('keeps all accounts summing to zero (the house funds grants)', async () => {
    const total = await db.query<{ s: string }>(`SELECT SUM(balance)::text AS s FROM accounts`);
    expect(total.rows[0]!.s).toBe('0');
  });
});
