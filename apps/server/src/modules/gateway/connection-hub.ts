import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PROTOCOL_VERSION } from '@holdem/shared';
import type { ServerMessage } from '@holdem/shared';
import { CLOCK } from '../../core/clock.js';
import type { Clock } from '../../core/clock.js';
import { viewerEvent } from '../table-runtime/table-actor.js';
import type { Broadcast, TableActor } from '../table-runtime/table-actor.js';
import { TableEvents } from '../table-runtime/table-events.js';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
import type { Connection } from './connection.js';

/** Tracks which connections watch which table and delivers each one its own view of every event. */
@Injectable()
export class ConnectionHub implements OnModuleInit, OnModuleDestroy {
  private readonly subscribers = new Map<string, Set<Connection>>();
  private stopListening: (() => void) | null = null;

  constructor(
    @Inject(TableRuntime) private readonly runtime: TableRuntime,
    @Inject(TableEvents) private readonly events: TableEvents,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.stopListening = this.events.subscribe((tableId, broadcast) => this.deliver(tableId, broadcast));
  }

  onModuleDestroy(): void {
    this.stopListening?.();
  }

  subscribe(connection: Connection, tableId: string): void {
    let set = this.subscribers.get(tableId);
    if (!set) this.subscribers.set(tableId, (set = new Set()));
    set.add(connection);
    connection.tables.add(tableId);
  }

  unsubscribe(connection: Connection, tableId: string): void {
    this.subscribers.get(tableId)?.delete(connection);
    connection.tables.delete(tableId);
  }

  remove(connection: Connection): void {
    for (const tableId of connection.tables) this.subscribers.get(tableId)?.delete(connection);
    connection.tables.clear();
  }

  isSubscribed(connection: Connection, tableId: string): boolean {
    return connection.tables.has(tableId);
  }

  sendSnapshot(connection: Connection, actor: TableActor): void {
    connection.send({
      v: PROTOCOL_VERSION,
      type: 'table.snapshot',
      tableId: actor.id,
      seq: actor.seq,
      ts: this.clock.now(),
      payload: actor.snapshotFor(connection.userId),
    });
  }

  sendEvents(connection: Connection, actor: TableActor, broadcasts: readonly Broadcast[]): void {
    const seat = connection.userId ? actor.seatOf(connection.userId) : null;
    for (const broadcast of broadcasts) this.sendEvent(connection, actor.id, broadcast, seat);
  }

  private deliver(tableId: string, broadcast: Broadcast): void {
    const watchers = this.subscribers.get(tableId);
    const actor = this.runtime.get(tableId);
    if (!watchers || !actor) return;
    for (const connection of watchers) {
      const seat = connection.userId ? actor.seatOf(connection.userId) : null;
      this.sendEvent(connection, tableId, broadcast, seat);
    }
  }

  private sendEvent(connection: Connection, tableId: string, broadcast: Broadcast, seat: number | null): void {
    connection.send({
      v: PROTOCOL_VERSION,
      ...viewerEvent(broadcast, seat),
      tableId,
      seq: broadcast.seq,
      ts: broadcast.ts,
    } as ServerMessage);
  }
}
