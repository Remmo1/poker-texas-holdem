import type { DynamicModule } from '@nestjs/common';
import type { AppConfig } from '../config/config.js';
import type { Db } from '../infra/db/db.js';
import type { DeckSource } from '../modules/table-runtime/fairness.js';
import type { Clock } from './clock.js';
export interface CoreOptions {
    readonly db: Db;
    readonly config: AppConfig;
    readonly clock?: Clock;
    readonly deckSource?: DeckSource;
}
export declare class CoreModule {
    static forRoot(options: CoreOptions): DynamicModule;
}
