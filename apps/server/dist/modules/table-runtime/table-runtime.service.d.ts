import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { TableSummary } from '@holdem/shared';
import type { AppConfig } from '../../config/config.js';
import type { Clock } from '../../core/clock.js';
import type { DeckSource } from './fairness.js';
import { TableActor } from './table-actor.js';
import type { TableConfig } from './table-config.js';
import { TableEvents } from './table-events.js';
import type { TableStore } from './table-store.js';
/** Registry of live table actors. */
export declare class TableRuntime implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly store;
    private readonly clock;
    private readonly deckSource;
    private readonly config;
    private readonly events;
    private readonly logger;
    private readonly actors;
    constructor(store: TableStore, clock: Clock, deckSource: DeckSource, config: AppConfig, events: TableEvents);
    onApplicationBootstrap(): Promise<void>;
    onModuleDestroy(): void;
    createTable(name: string, config: TableConfig): Promise<TableActor>;
    get(tableId: string): TableActor | undefined;
    list(): TableSummary[];
    private restore;
    private spawn;
}
