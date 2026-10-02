import type { Card, HandEvent } from '@holdem/poker-engine';
import type { Db } from '../../infra/db/db.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { TableDefinition } from './table-config.js';
export interface SeatRecord {
    readonly seat: number;
    readonly userId: string;
    readonly username: string;
    readonly stack: bigint;
}
export interface HandStartRecord {
    readonly handId: string;
    readonly tableId: string;
    readonly handNo: number;
    readonly deckCommit: string;
    readonly players: readonly {
        userId: string;
        seat: number;
        startStack: bigint;
    }[];
    readonly events: readonly HandEvent[];
    readonly end?: HandEndRecord;
}
export interface HandEndRecord {
    readonly deck: readonly Card[];
    readonly salt: string;
    readonly players: readonly {
        userId: string;
        endStack: bigint;
        holeCards: string | null;
    }[];
    /** Table seat stacks after the hand, so a restart resumes from them. */
    readonly seats: readonly {
        seat: number;
        stack: bigint;
    }[];
}
export interface HandAppendRecord {
    readonly handId: string;
    readonly tableId: string;
    /** Index of the first event in `events` within the hand's event log. */
    readonly fromSeq: number;
    readonly events: readonly HandEvent[];
    readonly end?: HandEndRecord;
}
/** Persistence port for the table runtime. All multi-step methods are single transactions. */
export interface TableStore {
    createTable(definition: TableDefinition): Promise<void>;
    loadTables(): Promise<TableDefinition[]>;
    loadSeats(tableId: string): Promise<SeatRecord[]>;
    lastHandNo(tableId: string): Promise<number>;
    voidUnfinishedHands(tableId: string): Promise<number>;
    /** Moves the buy-in from the user's wallet to the table and records the seat. */
    sitPlayer(p: {
        tableId: string;
        seat: number;
        userId: string;
        stack: bigint;
    }): Promise<void>;
    /** Removes the seat and returns `stack` to the user's wallet. */
    standPlayer(p: {
        tableId: string;
        seat: number;
        userId: string;
        stack: bigint;
    }): Promise<void>;
    startHand(record: HandStartRecord): Promise<void>;
    appendHandEvents(record: HandAppendRecord): Promise<void>;
}
export declare const TABLE_STORE: unique symbol;
export declare class PgTableStore implements TableStore {
    private readonly db;
    private readonly wallet;
    constructor(db: Db, wallet: WalletService);
    createTable(definition: TableDefinition): Promise<void>;
    loadTables(): Promise<TableDefinition[]>;
    loadSeats(tableId: string): Promise<SeatRecord[]>;
    lastHandNo(tableId: string): Promise<number>;
    /** A hand that never finished (crash) is voided; stacks were only persisted at hand end, so they are still correct. */
    voidUnfinishedHands(tableId: string): Promise<number>;
    sitPlayer(p: {
        tableId: string;
        seat: number;
        userId: string;
        stack: bigint;
    }): Promise<void>;
    standPlayer(p: {
        tableId: string;
        seat: number;
        userId: string;
        stack: bigint;
    }): Promise<void>;
    startHand(record: HandStartRecord): Promise<void>;
    appendHandEvents(record: HandAppendRecord): Promise<void>;
    private insertEvents;
    private finishHand;
}
