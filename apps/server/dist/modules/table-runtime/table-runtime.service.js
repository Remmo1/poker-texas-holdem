var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TableRuntime_1;
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG } from '../../config/tokens.js';
import { CLOCK } from '../../core/clock.js';
import { DECK_SOURCE } from './fairness.js';
import { TableActor } from './table-actor.js';
import { toWireConfig } from './table-config.js';
import { TableEvents } from './table-events.js';
import { TABLE_STORE } from './table-store.js';
const DEFAULT_TABLES = [
    {
        name: 'Micro 10/20',
        config: { maxSeats: 6, smallBlind: 10n, bigBlind: 20n, minBuyIn: 400n, maxBuyIn: 2000n, actionTimeMs: 20_000 },
    },
];
/** Registry of live table actors. */
let TableRuntime = TableRuntime_1 = class TableRuntime {
    store;
    clock;
    deckSource;
    config;
    events;
    logger = new Logger(TableRuntime_1.name);
    actors = new Map();
    constructor(store, clock, deckSource, config, events) {
        this.store = store;
        this.clock = clock;
        this.deckSource = deckSource;
        this.config = config;
        this.events = events;
    }
    async onApplicationBootstrap() {
        const tables = await this.store.loadTables();
        if (tables.length === 0) {
            for (const seed of DEFAULT_TABLES)
                await this.createTable(seed.name, seed.config);
            return;
        }
        for (const definition of tables)
            await this.restore(definition);
    }
    onModuleDestroy() {
        for (const actor of this.actors.values())
            actor.dispose();
    }
    async createTable(name, config) {
        const definition = { id: randomUUID(), name, config };
        await this.store.createTable(definition);
        return this.spawn(definition, { seats: [], lastHandNo: 0 });
    }
    get(tableId) {
        return this.actors.get(tableId);
    }
    list() {
        return [...this.actors.values()].map((a) => ({
            id: a.id,
            name: a.definition.name,
            config: toWireConfig(a.definition.config),
            seated: a.seatedCount,
        }));
    }
    async restore(definition) {
        const voided = await this.store.voidUnfinishedHands(definition.id);
        if (voided > 0)
            this.logger.warn(`Table ${definition.id}: voided ${voided} unfinished hand(s)`);
        const seats = await this.store.loadSeats(definition.id);
        const lastHandNo = await this.store.lastHandNo(definition.id);
        this.spawn(definition, { seats, lastHandNo }).start();
    }
    spawn(definition, restored) {
        const actor = new TableActor(definition, {
            store: this.store,
            clock: this.clock,
            deckSource: this.deckSource,
            handStartDelayMs: this.config.handStartDelayMs,
            publish: (tableId, broadcast) => this.events.emit(tableId, broadcast),
            onError: (message, error) => this.logger.error(message, error instanceof Error ? error.stack : String(error)),
        }, restored);
        this.actors.set(definition.id, actor);
        return actor;
    }
};
TableRuntime = TableRuntime_1 = __decorate([
    Injectable(),
    __param(0, Inject(TABLE_STORE)),
    __param(1, Inject(CLOCK)),
    __param(2, Inject(DECK_SOURCE)),
    __param(3, Inject(CONFIG)),
    __param(4, Inject(TableEvents))
], TableRuntime);
export { TableRuntime };
//# sourceMappingURL=table-runtime.service.js.map