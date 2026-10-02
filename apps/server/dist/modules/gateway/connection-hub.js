var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable } from '@nestjs/common';
import { PROTOCOL_VERSION } from '@holdem/shared';
import { CLOCK } from '../../core/clock.js';
import { viewerEvent } from '../table-runtime/table-actor.js';
import { TableEvents } from '../table-runtime/table-events.js';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
/** Tracks which connections watch which table and delivers each one its own view of every event. */
let ConnectionHub = class ConnectionHub {
    runtime;
    events;
    clock;
    subscribers = new Map();
    stopListening = null;
    constructor(runtime, events, clock) {
        this.runtime = runtime;
        this.events = events;
        this.clock = clock;
    }
    onModuleInit() {
        this.stopListening = this.events.subscribe((tableId, broadcast) => this.deliver(tableId, broadcast));
    }
    onModuleDestroy() {
        this.stopListening?.();
    }
    subscribe(connection, tableId) {
        let set = this.subscribers.get(tableId);
        if (!set)
            this.subscribers.set(tableId, (set = new Set()));
        set.add(connection);
        connection.tables.add(tableId);
    }
    unsubscribe(connection, tableId) {
        this.subscribers.get(tableId)?.delete(connection);
        connection.tables.delete(tableId);
    }
    remove(connection) {
        for (const tableId of connection.tables)
            this.subscribers.get(tableId)?.delete(connection);
        connection.tables.clear();
    }
    isSubscribed(connection, tableId) {
        return connection.tables.has(tableId);
    }
    sendSnapshot(connection, actor) {
        connection.send({
            v: PROTOCOL_VERSION,
            type: 'table.snapshot',
            tableId: actor.id,
            seq: actor.seq,
            ts: this.clock.now(),
            payload: actor.snapshotFor(connection.userId),
        });
    }
    sendEvents(connection, actor, broadcasts) {
        const seat = connection.userId ? actor.seatOf(connection.userId) : null;
        for (const broadcast of broadcasts)
            this.sendEvent(connection, actor.id, broadcast, seat);
    }
    deliver(tableId, broadcast) {
        const watchers = this.subscribers.get(tableId);
        const actor = this.runtime.get(tableId);
        if (!watchers || !actor)
            return;
        for (const connection of watchers) {
            const seat = connection.userId ? actor.seatOf(connection.userId) : null;
            this.sendEvent(connection, tableId, broadcast, seat);
        }
    }
    sendEvent(connection, tableId, broadcast, seat) {
        connection.send({
            v: PROTOCOL_VERSION,
            ...viewerEvent(broadcast, seat),
            tableId,
            seq: broadcast.seq,
            ts: broadcast.ts,
        });
    }
};
ConnectionHub = __decorate([
    Injectable(),
    __param(0, Inject(TableRuntime)),
    __param(1, Inject(TableEvents)),
    __param(2, Inject(CLOCK))
], ConnectionHub);
export { ConnectionHub };
//# sourceMappingURL=connection-hub.js.map