var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable } from '@nestjs/common';
import { DB, toChips } from '../../infra/db/db.js';
export class InsufficientFundsError extends Error {
    constructor() {
        super('Insufficient funds');
        this.name = 'InsufficientFundsError';
    }
}
/** Double-entry ledger: every transfer writes balanced entries and moves account balances. */
let WalletService = class WalletService {
    db;
    constructor(db) {
        this.db = db;
    }
    async openUserAccount(tx, userId) {
        await tx.query(`INSERT INTO accounts (owner_type, owner_id) VALUES ('user', $1)`, [userId]);
    }
    async openTableAccount(tx, tableId) {
        await tx.query(`INSERT INTO accounts (owner_type, owner_id) VALUES ('table', $1)`, [tableId]);
    }
    async balanceOf(ref, q = this.db) {
        const result = await q.query(`SELECT id, balance::text AS balance FROM accounts WHERE owner_type = $1 AND owner_id IS NOT DISTINCT FROM $2`, [ref.type, ref.type === 'house' ? null : ref.id]);
        if (result.rowCount === 0)
            throw new Error(`Unknown account ${ref.type}`);
        return toChips(result.rows[0].balance);
    }
    /** Must run inside the caller's transaction so it commits atomically with related writes. */
    async transfer(tx, request) {
        if (request.amount <= 0n)
            throw new RangeError('Transfer amount must be positive');
        const inserted = await tx.query(`INSERT INTO ledger_transactions (kind, idempotency_key) VALUES ($1, $2)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`, [request.kind, request.idempotencyKey]);
        if (inserted.rowCount === 0)
            return 'duplicate';
        const transactionId = inserted.rows[0].id;
        const fromId = await this.accountId(tx, request.from);
        const toId = await this.accountId(tx, request.to);
        // Lock in id order so concurrent opposite transfers cannot deadlock.
        const locked = await tx.query(`SELECT id, balance::text AS balance FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[fromId, toId]]);
        const fromRow = locked.rows.find((r) => r.id === fromId);
        if (request.from.type !== 'house' && toChips(fromRow.balance) < request.amount) {
            throw new InsufficientFundsError();
        }
        const amount = request.amount.toString();
        await tx.query(`UPDATE accounts SET balance = balance - $2::bigint WHERE id = $1`, [fromId, amount]);
        await tx.query(`UPDATE accounts SET balance = balance + $2::bigint WHERE id = $1`, [toId, amount]);
        await tx.query(`INSERT INTO ledger_entries (transaction_id, account_id, amount) VALUES ($1, $2, -$3::bigint), ($1, $4, $3::bigint)`, [transactionId, fromId, amount, toId]);
        return 'applied';
    }
    async accountId(tx, ref) {
        const result = await tx.query(`SELECT id FROM accounts WHERE owner_type = $1 AND owner_id IS NOT DISTINCT FROM $2`, [ref.type, ref.type === 'house' ? null : ref.id]);
        if (result.rowCount === 0)
            throw new Error(`Unknown account ${ref.type}`);
        return result.rows[0].id;
    }
};
WalletService = __decorate([
    Injectable(),
    __param(0, Inject(DB))
], WalletService);
export { WalletService };
//# sourceMappingURL=wallet.service.js.map