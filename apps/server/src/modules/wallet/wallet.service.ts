import { Inject, Injectable } from '@nestjs/common';
import { DB, toChips } from '../../infra/db/db.js';
import type { Db, Queryable } from '../../infra/db/db.js';

export type AccountRef = { readonly type: 'user' | 'table'; readonly id: string } | { readonly type: 'house' };

export type TransferKind = 'buy_in' | 'cash_out' | 'bonus';

export interface TransferRequest {
  readonly kind: TransferKind;
  readonly from: AccountRef;
  readonly to: AccountRef;
  readonly amount: bigint;
  /** A repeated key makes the transfer a no-op, so retries never double-move chips. */
  readonly idempotencyKey: string;
}

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient funds');
    this.name = 'InsufficientFundsError';
  }
}

interface AccountRow {
  id: string;
  balance: string;
}

/** Double-entry ledger: every transfer writes balanced entries and moves account balances. */
@Injectable()
export class WalletService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async openUserAccount(tx: Queryable, userId: string): Promise<void> {
    await tx.query(`INSERT INTO accounts (owner_type, owner_id) VALUES ('user', $1)`, [userId]);
  }

  async openTableAccount(tx: Queryable, tableId: string): Promise<void> {
    await tx.query(`INSERT INTO accounts (owner_type, owner_id) VALUES ('table', $1)`, [tableId]);
  }

  async balanceOf(ref: AccountRef, q: Queryable = this.db): Promise<bigint> {
    const result = await q.query<AccountRow>(
      `SELECT id, balance::text AS balance FROM accounts WHERE owner_type = $1 AND owner_id IS NOT DISTINCT FROM $2`,
      [ref.type, ref.type === 'house' ? null : ref.id],
    );
    if (result.rowCount === 0) throw new Error(`Unknown account ${ref.type}`);
    return toChips(result.rows[0]!.balance);
  }

  /** Must run inside the caller's transaction so it commits atomically with related writes. */
  async transfer(tx: Queryable, request: TransferRequest): Promise<'applied' | 'duplicate'> {
    if (request.amount <= 0n) throw new RangeError('Transfer amount must be positive');

    const inserted = await tx.query(
      `INSERT INTO ledger_transactions (kind, idempotency_key) VALUES ($1, $2)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [request.kind, request.idempotencyKey],
    );
    if (inserted.rowCount === 0) return 'duplicate';
    const transactionId = (inserted.rows[0] as { id: string }).id;

    const fromId = await this.accountId(tx, request.from);
    const toId = await this.accountId(tx, request.to);

    // Lock in id order so concurrent opposite transfers cannot deadlock.
    const locked = await tx.query<AccountRow>(
      `SELECT id, balance::text AS balance FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [[fromId, toId]],
    );
    const fromRow = locked.rows.find((r) => r.id === fromId)!;
    if (request.from.type !== 'house' && toChips(fromRow.balance) < request.amount) {
      throw new InsufficientFundsError();
    }

    const amount = request.amount.toString();
    await tx.query(`UPDATE accounts SET balance = balance - $2::bigint WHERE id = $1`, [fromId, amount]);
    await tx.query(`UPDATE accounts SET balance = balance + $2::bigint WHERE id = $1`, [toId, amount]);
    await tx.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, amount) VALUES ($1, $2, -$3::bigint), ($1, $4, $3::bigint)`,
      [transactionId, fromId, amount, toId],
    );
    return 'applied';
  }

  private async accountId(tx: Queryable, ref: AccountRef): Promise<string> {
    const result = await tx.query<{ id: string }>(
      `SELECT id FROM accounts WHERE owner_type = $1 AND owner_id IS NOT DISTINCT FROM $2`,
      [ref.type, ref.type === 'house' ? null : ref.id],
    );
    if (result.rowCount === 0) throw new Error(`Unknown account ${ref.type}`);
    return result.rows[0]!.id;
  }
}
