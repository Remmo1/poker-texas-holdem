import { Injectable } from '@nestjs/common';
import type { Broadcast } from './table-actor.js';

export type BroadcastListener = (tableId: string, broadcast: Broadcast) => void;

/** Decouples the table runtime from whatever delivers events (WebSocket hub today, other consumers later). */
@Injectable()
export class TableEvents {
  private readonly listeners = new Set<BroadcastListener>();

  subscribe(listener: BroadcastListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(tableId: string, broadcast: Broadcast): void {
    for (const listener of this.listeners) {
      try {
        listener(tableId, broadcast);
      } catch {
        // One faulty listener must not stop delivery to the others or break the table.
      }
    }
  }
}
