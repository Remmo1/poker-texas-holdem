import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import type { Db } from '../db/db.js';
import type { EventBus } from './event-bus.js';
/** Publishes committed outbox rows to the bus in order; delivery is at-least-once, so consumers must be idempotent. */
export declare class OutboxRelay implements OnModuleInit, OnModuleDestroy {
    private readonly db;
    private readonly bus;
    private readonly config;
    private readonly logger;
    private timer;
    private draining;
    constructor(db: Db, bus: EventBus, config: AppConfig);
    onModuleInit(): void;
    onModuleDestroy(): void;
    /** Publishes everything pending; returns how many rows were published. */
    drain(batchSize?: number): Promise<number>;
    private drainBatch;
}
