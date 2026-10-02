var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OutboxRelay_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG } from '../../config/tokens.js';
import { DB } from '../db/db.js';
import { reviveBigints } from '../json.js';
import { EVENT_BUS } from './event-bus.js';
/** Publishes committed outbox rows to the bus in order; delivery is at-least-once, so consumers must be idempotent. */
let OutboxRelay = OutboxRelay_1 = class OutboxRelay {
    db;
    bus;
    config;
    logger = new Logger(OutboxRelay_1.name);
    timer = null;
    draining = false;
    constructor(db, bus, config) {
        this.db = db;
        this.bus = bus;
        this.config = config;
    }
    onModuleInit() {
        if (this.config.outboxPollMs <= 0)
            return;
        this.timer = setInterval(() => {
            this.drain().catch((error) => this.logger.error('Outbox drain failed', error instanceof Error ? error.stack : String(error)));
        }, this.config.outboxPollMs);
        this.timer.unref();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    /** Publishes everything pending; returns how many rows were published. */
    async drain(batchSize = 100) {
        if (this.draining)
            return 0;
        this.draining = true;
        try {
            let total = 0;
            for (;;) {
                const published = await this.drainBatch(batchSize);
                total += published;
                if (published < batchSize)
                    return total;
            }
        }
        finally {
            this.draining = false;
        }
    }
    drainBatch(batchSize) {
        return this.db.transaction(async (tx) => {
            const pending = await tx.query(`SELECT id::text AS id_text, aggregate_id, type, payload FROM outbox
          WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [batchSize]);
            if (pending.rowCount === 0)
                return 0;
            const messages = pending.rows.map((r) => ({
                id: Number(r.id_text),
                aggregateId: r.aggregate_id,
                type: r.type,
                payload: reviveBigints(r.payload),
            }));
            await this.bus.publish(messages);
            await tx.query(`UPDATE outbox SET published_at = now() WHERE id = ANY($1::bigint[])`, [messages.map((m) => m.id)]);
            return messages.length;
        });
    }
};
OutboxRelay = OutboxRelay_1 = __decorate([
    Injectable(),
    __param(0, Inject(DB)),
    __param(1, Inject(EVENT_BUS)),
    __param(2, Inject(CONFIG))
], OutboxRelay);
export { OutboxRelay };
//# sourceMappingURL=outbox-relay.js.map