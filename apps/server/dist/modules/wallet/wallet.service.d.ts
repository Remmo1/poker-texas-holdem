import type { Db, Queryable } from '../../infra/db/db.js';
export type AccountRef = {
    readonly type: 'user' | 'table';
    readonly id: string;
} | {
    readonly type: 'house';
};
export type TransferKind = 'buy_in' | 'cash_out' | 'bonus';
export interface TransferRequest {
    readonly kind: TransferKind;
    readonly from: AccountRef;
    readonly to: AccountRef;
    readonly amount: bigint;
    /** A repeated key makes the transfer a no-op, so retries never double-move chips. */
    readonly idempotencyKey: string;
}
export declare class InsufficientFundsError extends Error {
    constructor();
}
/** Double-entry ledger: every transfer writes balanced entries and moves account balances. */
export declare class WalletService {
    private readonly db;
    constructor(db: Db);
    openUserAccount(tx: Queryable, userId: string): Promise<void>;
    openTableAccount(tx: Queryable, tableId: string): Promise<void>;
    balanceOf(ref: AccountRef, q?: Queryable): Promise<bigint>;
    /** Must run inside the caller's transaction so it commits atomically with related writes. */
    transfer(tx: Queryable, request: TransferRequest): Promise<'applied' | 'duplicate'>;
    private accountId;
}
