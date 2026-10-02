var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { EVENT_BUS, InProcessEventBus } from '../../infra/event-bus/event-bus.js';
import { OutboxRelay } from '../../infra/event-bus/outbox-relay.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { TableEvents } from './table-events.js';
import { TableRuntime } from './table-runtime.service.js';
import { PgTableStore, TABLE_STORE } from './table-store.js';
let TableRuntimeModule = class TableRuntimeModule {
};
TableRuntimeModule = __decorate([
    Module({
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
], TableRuntimeModule);
export { TableRuntimeModule };
//# sourceMappingURL=table-runtime.module.js.map