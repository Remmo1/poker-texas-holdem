import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { TableSummary } from '@holdem/shared';
import type { AppConfig } from '../../config/config.js';
import { CONFIG } from '../../config/tokens.js';
import { CLOCK } from '../../core/clock.js';
import type { Clock } from '../../core/clock.js';
import { DECK_SOURCE } from './fairness.js';
import type { DeckSource } from './fairness.js';
import { TableActor } from './table-actor.js';
import type { TableConfig, TableDefinition } from './table-config.js';
import { toWireConfig } from './table-config.js';
import { TableEvents } from './table-events.js';
import { TABLE_STORE } from './table-store.js';
import type { TableStore } from './table-store.js';

const DEFAULT_TABLES: readonly { name: string; config: TableConfig }[] = [
  {
    name: 'Micro 10/20',
    config: { maxSeats: 6, smallBlind: 10n, bigBlind: 20n, minBuyIn: 400n, maxBuyIn: 2000n, actionTimeMs: 20_000 },
  },
];

/** Registry of live table actors. */
@Injectable()
export class TableRuntime implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TableRuntime.name);
  private readonly actors = new Map<string, TableActor>();

  constructor(
    @Inject(TABLE_STORE) private readonly store: TableStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DECK_SOURCE) private readonly deckSource: DeckSource,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(TableEvents) private readonly events: TableEvents,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const tables = await this.store.loadTables();
    if (tables.length === 0) {
      for (const seed of DEFAULT_TABLES) await this.createTable(seed.name, seed.config);
      return;
    }
    for (const definition of tables) await this.restore(definition);
  }

  onModuleDestroy(): void {
    for (const actor of this.actors.values()) actor.dispose();
  }

  async createTable(name: string, config: TableConfig): Promise<TableActor> {
    const definition: TableDefinition = { id: randomUUID(), name, config };
    await this.store.createTable(definition);
    return this.spawn(definition, { seats: [], lastHandNo: 0 });
  }

  get(tableId: string): TableActor | undefined {
    return this.actors.get(tableId);
  }

  list(): TableSummary[] {
    return [...this.actors.values()].map((a) => ({
      id: a.id,
      name: a.definition.name,
      config: toWireConfig(a.definition.config),
      seated: a.seatedCount,
    }));
  }

  private async restore(definition: TableDefinition): Promise<void> {
    const voided = await this.store.voidUnfinishedHands(definition.id);
    if (voided > 0) this.logger.warn(`Table ${definition.id}: voided ${voided} unfinished hand(s)`);
    const seats = await this.store.loadSeats(definition.id);
    const lastHandNo = await this.store.lastHandNo(definition.id);
    this.spawn(definition, { seats, lastHandNo }).start();
  }

  private spawn(definition: TableDefinition, restored: ConstructorParameters<typeof TableActor>[2]): TableActor {
    const actor = new TableActor(
      definition,
      {
        store: this.store,
        clock: this.clock,
        deckSource: this.deckSource,
        handStartDelayMs: this.config.handStartDelayMs,
        publish: (tableId, broadcast) => this.events.emit(tableId, broadcast),
        onError: (message, error) => this.logger.error(message, error instanceof Error ? error.stack : String(error)),
      },
      restored,
    );
    this.actors.set(definition.id, actor);
    return actor;
  }
}
