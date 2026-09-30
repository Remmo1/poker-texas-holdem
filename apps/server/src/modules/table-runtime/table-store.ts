import { randomUUID } from 'node:crypto';
import { cardToString } from '@holdem/poker-engine';
import type { Card, HandEvent } from '@holdem/poker-engine';
import { Inject, Injectable } from '@nestjs/common';
import { DB, toChips } from '../../infra/db/db.js';
import type { Db, Queryable } from '../../infra/db/db.js';
import { encodeJson } from '../../infra/json.js';
import { WalletService } from '../wallet/wallet.service.js';
import { fromWireConfig, toWireConfig } from './table-config.js';
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
  readonly players: readonly { userId: string; seat: number; startStack: bigint }[];
  readonly events: readonly HandEvent[];
  readonly end?: HandEndRecord;
}

export interface HandEndRecord {
  readonly deck: readonly Card[];
  readonly salt: string;
  readonly players: readonly { userId: string; endStack: bigint; holeCards: string | null }[];
  /** Table seat stacks after the hand, so a restart resumes from them. */
  readonly seats: readonly { seat: number; stack: bigint }[];
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
  sitPlayer(p: { tableId: string; seat: number; userId: string; stack: bigint }): Promise<void>;
  /** Removes the seat and returns `stack` to the user's wallet. */
  standPlayer(p: { tableId: string; seat: number; userId: string; stack: bigint }): Promise<void>;
  startHand(record: HandStartRecord): Promise<void>;
  appendHandEvents(record: HandAppendRecord): Promise<void>;
}

export const TABLE_STORE = Symbol('TABLE_STORE');

/** The deck is stripped: analyzers on the bus never need undealt cards. */
function outboxPayload(event: HandEvent): HandEvent {
  return event.type === 'HandStarted' ? { ...event, deck: [] } : event;
}

@Injectable()
export class PgTableStore implements TableStore {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(WalletService) private readonly wallet: WalletService,
  ) {}

  async createTable(definition: TableDefinition): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(`INSERT INTO tables (id, name, config) VALUES ($1, $2, $3::jsonb)`, [
        definition.id,
        definition.name,
        JSON.stringify(toWireConfig(definition.config)),
      ]);
      await this.wallet.openTableAccount(tx, definition.id);
    });
  }

  async loadTables(): Promise<TableDefinition[]> {
    const result = await this.db.query<{ id: string; name: string; config: unknown }>(
      `SELECT id, name, config FROM tables WHERE status = 'open' ORDER BY created_at, id`,
    );
    return result.rows.map((r) => ({ id: r.id, name: r.name, config: fromWireConfig(r.config) }));
  }

  async loadSeats(tableId: string): Promise<SeatRecord[]> {
    const result = await this.db.query<{ seat_index: number; user_id: string; username: string; stack: string }>(
      `SELECT s.seat_index, s.user_id, u.username, s.stack::text AS stack
         FROM table_seats s JOIN users u ON u.id = s.user_id
        WHERE s.table_id = $1 ORDER BY s.seat_index`,
      [tableId],
    );
    return result.rows.map((r) => ({
      seat: Number(r.seat_index),
      userId: r.user_id,
      username: r.username,
      stack: toChips(r.stack),
    }));
  }

  async lastHandNo(tableId: string): Promise<number> {
    const result = await this.db.query<{ n: string }>(
      `SELECT COALESCE(MAX(hand_no), 0)::text AS n FROM hands WHERE table_id = $1`,
      [tableId],
    );
    return Number(result.rows[0]!.n);
  }

  /** A hand that never finished (crash) is voided; stacks were only persisted at hand end, so they are still correct. */
  async voidUnfinishedHands(tableId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE hands SET status = 'void', ended_at = now() WHERE table_id = $1 AND status = 'in_progress'`,
      [tableId],
    );
    return result.rowCount;
  }

  async sitPlayer(p: { tableId: string; seat: number; userId: string; stack: bigint }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.wallet.transfer(tx, {
        kind: 'buy_in',
        from: { type: 'user', id: p.userId },
        to: { type: 'table', id: p.tableId },
        amount: p.stack,
        idempotencyKey: `buy_in:${randomUUID()}`,
      });
      await tx.query(`INSERT INTO table_seats (table_id, seat_index, user_id, stack) VALUES ($1, $2, $3, $4::bigint)`, [
        p.tableId,
        p.seat,
        p.userId,
        p.stack.toString(),
      ]);
    });
  }

  async standPlayer(p: { tableId: string; seat: number; userId: string; stack: bigint }): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (p.stack > 0n) {
        await this.wallet.transfer(tx, {
          kind: 'cash_out',
          from: { type: 'table', id: p.tableId },
          to: { type: 'user', id: p.userId },
          amount: p.stack,
          idempotencyKey: `cash_out:${randomUUID()}`,
        });
      }
      await tx.query(`DELETE FROM table_seats WHERE table_id = $1 AND seat_index = $2`, [p.tableId, p.seat]);
    });
  }

  async startHand(record: HandStartRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(`INSERT INTO hands (id, table_id, hand_no, deck_commit) VALUES ($1, $2, $3, $4)`, [
        record.handId,
        record.tableId,
        record.handNo,
        record.deckCommit,
      ]);
      for (const player of record.players) {
        await tx.query(
          `INSERT INTO hand_players (hand_id, user_id, seat_index, start_stack) VALUES ($1, $2, $3, $4::bigint)`,
          [record.handId, player.userId, player.seat, player.startStack.toString()],
        );
      }
      await this.insertEvents(tx, record.handId, record.tableId, 0, record.events);
      if (record.end) await this.finishHand(tx, record.handId, record.tableId, record.end);
    });
  }

  async appendHandEvents(record: HandAppendRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.insertEvents(tx, record.handId, record.tableId, record.fromSeq, record.events);
      if (record.end) await this.finishHand(tx, record.handId, record.tableId, record.end);
    });
  }

  private async insertEvents(
    tx: Queryable,
    handId: string,
    tableId: string,
    fromSeq: number,
    events: readonly HandEvent[],
  ): Promise<void> {
    for (const [i, event] of events.entries()) {
      const seq = fromSeq + i;
      await tx.query(`INSERT INTO hand_events (hand_id, seq, type, payload) VALUES ($1, $2, $3, $4::jsonb)`, [
        handId,
        seq,
        event.type,
        encodeJson(event),
      ]);
      await tx.query(`INSERT INTO outbox (aggregate_id, type, payload) VALUES ($1, $2, $3::jsonb)`, [
        handId,
        event.type,
        encodeJson({ handId, tableId, seq, event: outboxPayload(event) }),
      ]);
    }
  }

  private async finishHand(tx: Queryable, handId: string, tableId: string, end: HandEndRecord): Promise<void> {
    await tx.query(
      `UPDATE hands SET status = 'complete', ended_at = now(), deck_reveal = $2::jsonb, deck_salt = $3 WHERE id = $1`,
      [handId, JSON.stringify(end.deck.map(cardToString)), end.salt],
    );
    for (const player of end.players) {
      await tx.query(
        `UPDATE hand_players SET end_stack = $3::bigint, hole_cards = $4 WHERE hand_id = $1 AND user_id = $2`,
        [handId, player.userId, player.endStack.toString(), player.holeCards],
      );
    }
    for (const seat of end.seats) {
      await tx.query(`UPDATE table_seats SET stack = $3::bigint WHERE table_id = $1 AND seat_index = $2`, [
        tableId,
        seat.seat,
        seat.stack.toString(),
      ]);
    }
  }
}
