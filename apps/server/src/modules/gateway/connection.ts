import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@holdem/shared';
import type { WebSocket } from 'ws';
import type { TimerHandle } from '../../core/clock.js';
import type { TokenBucket } from './rate-limiter.js';

const OPEN = 1;
/** A client that lets more than this pile up unread is too slow to keep in sync. */
const MAX_BUFFERED_BYTES = 1_000_000;
const REPLY_CACHE_SIZE = 256;

export class Connection {
  readonly id = randomUUID();
  userId: string | null = null;
  username = '';
  strikes = 0;
  authTimer: TimerHandle | null = null;
  readonly tables = new Set<string>();
  private readonly replies = new Map<string, ServerMessage>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    readonly socket: WebSocket,
    readonly bucket: TokenBucket,
  ) {}

  /** Messages from one client are handled strictly in arrival order. */
  enqueue(work: () => Promise<void>): void {
    this.tail = this.tail.then(work, work);
  }

  /** Remembers the reply to a command so a client retry with the same id gets it again without re-running. */
  remember(id: string, reply: ServerMessage): void {
    this.replies.set(id, reply);
    if (this.replies.size > REPLY_CACHE_SIZE) this.replies.delete(this.replies.keys().next().value!);
  }

  recall(id: string): ServerMessage | undefined {
    return this.replies.get(id);
  }

  send(message: ServerMessage): void {
    if (this.socket.readyState !== OPEN) return;
    if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.socket.close(1013, 'Client too slow');
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}
