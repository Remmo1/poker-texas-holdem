import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { CONFIG } from '../config/tokens.js';
import type { AppConfig } from '../config/config.js';
import { DB } from '../infra/db/db.js';
import type { Db } from '../infra/db/db.js';
import { DECK_SOURCE, secureDeckSource } from '../modules/table-runtime/fairness.js';
import type { DeckSource } from '../modules/table-runtime/fairness.js';
import { CLOCK, systemClock } from './clock.js';
import type { Clock } from './clock.js';

export interface CoreOptions {
  readonly db: Db;
  readonly config: AppConfig;
  readonly clock?: Clock;
  readonly deckSource?: DeckSource;
}

@Global()
@Module({})
export class CoreModule {
  static forRoot(options: CoreOptions): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: DB, useValue: options.db },
        { provide: CONFIG, useValue: options.config },
        { provide: CLOCK, useValue: options.clock ?? systemClock },
        { provide: DECK_SOURCE, useValue: options.deckSource ?? secureDeckSource },
      ],
      exports: [DB, CONFIG, CLOCK, DECK_SOURCE],
    };
  }
}
