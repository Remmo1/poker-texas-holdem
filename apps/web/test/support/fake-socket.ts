import type { WebSocketLike } from '../../src/net/socket';
import { ack, authOk } from './messages';

type Wire = { id: string; type: string; payload: Record<string, unknown> };

/** In-memory WebSocket. By default it plays a cooperative server: auth.hello gets auth.ok, everything else an ack. */
export class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  readonly sent: Wire[] = [];
  /** Replaces the default replies; return the messages to send back. */
  respond: (message: Wire) => unknown[] = (message) => (message.type === 'auth.hello' ? [authOk(message.id)] : [ack(message.id)]);

  constructor(readonly url: string) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(data: string): void {
    const message = JSON.parse(data) as Wire;
    this.sent.push(message);
    for (const reply of this.respond(message)) queueMicrotask(() => this.receive(reply));
  }

  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code }));
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  /** What the client sent, optionally filtered by command type. */
  requests(type?: string): Wire[] {
    return this.sent.filter((m) => !type || m.type === type);
  }
}

export function fakeSocketFactory(configure?: (socket: FakeWebSocket) => void) {
  const sockets: FakeWebSocket[] = [];
  return {
    sockets,
    create: (url: string): WebSocketLike => {
      const socket = new FakeWebSocket(url);
      configure?.(socket);
      sockets.push(socket);
      return socket;
    },
    get last(): FakeWebSocket {
      return sockets[sockets.length - 1]!;
    },
  };
}

/** Lets every pending promise chain settle (they only involve microtasks and immediate timers). */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
