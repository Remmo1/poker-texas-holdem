var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { randomUUID } from 'node:crypto';
import { cardToString } from '@holdem/poker-engine';
import { Inject, Injectable } from '@nestjs/common';
import { DB, toChips } from '../../infra/db/db.js';
import { encodeJson } from '../../infra/json.js';
import { WalletService } from '../wallet/wallet.service.js';
import { fromWireConfig, toWireConfig } from './table-config.js';
export const TABLE_STORE = Symbol('TABLE_STORE');
/** The deck is stripped: analyzers on the bus never need undealt cards. */
function outboxPayload(event) {
    return event.type === 'HandStarted' ? { ...event, deck: [] } : event;
}
let PgTableStore = class PgTableStore {
    db;
    wallet;
    constructor(db, wallet) {
        this.db = db;
        this.wallet = wallet;
    }
    async createTable(definition) {
        await this.db.transaction(async (tx) => {
            await tx.query(`INSERT INTO tables (id, name, config) VALUES ($1, $2, $3::jsonb)`, [
                definition.id,
                definition.name,
                JSON.stringify(toWireConfig(definition.config)),
            ]);
            await this.wallet.openTableAccount(tx, definition.id);
        });
    }
    async loadTables() {
        const result = await this.db.query(`SELECT id, name, config FROM tables WHERE status = 'open' ORDER BY created_at, id`);
        return result.rows.map((r) => ({ id: r.id, name: r.name, config: fromWireConfig(r.config) }));
    }
    async loadSeats(tableId) {
        const result = await this.db.query(`SELECT s.seat_index, s.user_id, u.username, s.stack::text AS stack
         FROM table_seats s JOIN users u ON u.id = s.user_id
        WHERE s.table_id = $1 ORDER BY s.seat_index`, [tableId]);
        return result.rows.map((r) => ({
            seat: Number(r.seat_index),
            userId: r.user_id,
            username: r.username,
            stack: toChips(r.stack),
        }));
    }
    async lastHandNo(tableId) {
        const result = await this.db.query(`SELECT COALESCE(MAX(hand_no), 0)::text AS n FROM hands WHERE table_id = $1`, [tableId]);
        return Number(result.rows[0].n);
    }
    /** A hand that never finished (crash) is voided; stacks were only persisted at hand end, so they are still correct. */
    async voidUnfinishedHands(tableId) {
        const result = await this.db.query(`UPDATE hands SET status = 'void', ended_at = now() WHERE table_id = $1 AND status = 'in_progress'`, [tableId]);
        return result.rowCount;
    }
    async sitPlayer(p) {
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
    async standPlayer(p) {
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
    async startHand(record) {
        await this.db.transaction(async (tx) => {
            await tx.query(`INSERT INTO hands (id, table_id, hand_no, deck_commit) VALUES ($1, $2, $3, $4)`, [
                record.handId,
                record.tableId,
                record.handNo,
                record.deckCommit,
            ]);
            for (const player of record.players) {
                await tx.query(`INSERT INTO hand_players (hand_id, user_id, seat_index, start_stack) VALUES ($1, $2, $3, $4::bigint)`, [record.handId, player.userId, player.seat, player.startStack.toString()]);
            }
            await this.insertEvents(tx, record.handId, record.tableId, 0, record.events);
            if (record.end)
                await this.finishHand(tx, record.handId, record.tableId, record.end);
        });
    }
    async appendHandEvents(record) {
        await this.db.transaction(async (tx) => {
            await this.insertEvents(tx, record.handId, record.tableId, record.fromSeq, record.events);
            if (record.end)
                await this.finishHand(tx, record.handId, record.tableId, record.end);
        });
    }
    async insertEvents(tx, handId, tableId, fromSeq, events) {
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
    async finishHand(tx, handId, tableId, end) {
        await tx.query(`UPDATE hands SET status = 'complete', ended_at = now(), deck_reveal = $2::jsonb, deck_salt = $3 WHERE id = $1`, [handId, JSON.stringify(end.deck.map(cardToString)), end.salt]);
        for (const player of end.players) {
            await tx.query(`UPDATE hand_players SET end_stack = $3::bigint, hole_cards = $4 WHERE hand_id = $1 AND user_id = $2`, [handId, player.userId, player.endStack.toString(), player.holeCards]);
        }
        for (const seat of end.seats) {
            await tx.query(`UPDATE table_seats SET stack = $3::bigint WHERE table_id = $1 AND seat_index = $2`, [
                tableId,
                seat.seat,
                seat.stack.toString(),
            ]);
        }
    }
};
PgTableStore = __decorate([
    Injectable(),
    __param(0, Inject(DB)),
    __param(1, Inject(WalletService))
], PgTableStore);
export { PgTableStore };
//# sourceMappingURL=table-store.js.map