import { Module } from '@nestjs/common';
import { EVENT_BUS, InProcessEventBus } from '../../infra/event-bus/event-bus.js';
import { OutboxRelay } from '../../infra/event-bus/outbox-relay.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { TableEvents } from './table-events.js';
import { TableRuntime } from './table-runtime.service.js';
import { PgTableStore, TABLE_STORE } from './table-store.js';

@Module({
  imports: [WalletModule],
  providers: [
    TableEvents,
    TableRuntime,
    OutboxRelay,
    { provide: TABLE_STORE, useClass: PgTableStore },
    { provide: EVENT_BUS, useValue: new InProcessEventBus() },
  ],
  exports: [TableRuntime, TableEvents, OutboxRelay, EVENT_BUS],
})
export class TableRuntimeModule {}
