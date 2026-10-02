import type { Broadcast } from './table-actor.js';
export type BroadcastListener = (tableId: string, broadcast: Broadcast) => void;
/** Decouples the table runtime from whatever delivers events (WebSocket hub today, other consumers later). */
export declare class TableEvents {
    private readonly listeners;
    subscribe(listener: BroadcastListener): () => void;
    emit(tableId: string, broadcast: Broadcast): void;
}
