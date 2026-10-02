import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Clock } from '../../core/clock.js';
import type { Broadcast, TableActor } from '../table-runtime/table-actor.js';
import { TableEvents } from '../table-runtime/table-events.js';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
import type { Connection } from './connection.js';
/** Tracks which connections watch which table and delivers each one its own view of every event. */
export declare class ConnectionHub implements OnModuleInit, OnModuleDestroy {
    private readonly runtime;
    private readonly events;
    private readonly clock;
    private readonly subscribers;
    private stopListening;
    constructor(runtime: TableRuntime, events: TableEvents, clock: Clock);
    onModuleInit(): void;
    onModuleDestroy(): void;
    subscribe(connection: Connection, tableId: string): void;
    unsubscribe(connection: Connection, tableId: string): void;
    remove(connection: Connection): void;
    isSubscribed(connection: Connection, tableId: string): boolean;
    sendSnapshot(connection: Connection, actor: TableActor): void;
    sendEvents(connection: Connection, actor: TableActor, broadcasts: readonly Broadcast[]): void;
    private deliver;
    private sendEvent;
}
