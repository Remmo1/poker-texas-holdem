import type { ServerMessage } from '@holdem/shared';
import type { WebSocket } from 'ws';
import type { TimerHandle } from '../../core/clock.js';
import type { TokenBucket } from './rate-limiter.js';
export declare class Connection {
    readonly socket: WebSocket;
    readonly bucket: TokenBucket;
    readonly id: `${string}-${string}-${string}-${string}-${string}`;
    userId: string | null;
    username: string;
    strikes: number;
    authTimer: TimerHandle | null;
    readonly tables: Set<string>;
    private readonly replies;
    private tail;
    constructor(socket: WebSocket, bucket: TokenBucket);
    /** Messages from one client are handled strictly in arrival order. */
    enqueue(work: () => Promise<void>): void;
    /** Remembers the reply to a command so a client retry with the same id gets it again without re-running. */
    remember(id: string, reply: ServerMessage): void;
    recall(id: string): ServerMessage | undefined;
    send(message: ServerMessage): void;
}
