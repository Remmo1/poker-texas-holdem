import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import { CONFIG } from '../../config/tokens.js';
import { DB } from '../db/db.js';
import type { Db } from '../db/db.js';
import { reviveBigints } from '../json.js';
import { EVENT_BUS } from './event-bus.js';
import type { EventBus, OutboxMessage } from './event-bus.js';

interface OutboxRow {
  id_text: string;
  aggregate_id: string;
  type: string;
  payload: unknown;
}

/** Publishes committed outbox rows to the bus in order; delivery is at-least-once, so consumers must be idempotent. */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.outboxPollMs <= 0) return;
    this.timer = setInterval(() => {
      this.drain().catch((error) => this.logger.error('Outbox drain failed', error instanceof Error ? error.stack : String(error)));
    }, this.config.outboxPollMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Publishes everything pending; returns how many rows were published. */
  async drain(batchSize = 100): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    try {
      let total = 0;
      for (;;) {
        const published = await this.drainBatch(batchSize);
        total += published;
        if (published < batchSize) return total;
      }
    } finally {
      this.draining = false;
    }
  }

  private drainBatch(batchSize: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const pending = await tx.query<OutboxRow>(
        `SELECT id::text AS id_text, aggregate_id, type, payload FROM outbox
          WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );
      if (pending.rowCount === 0) return 0;

      const messages: OutboxMessage[] = pending.rows.map((r) => ({
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
}
