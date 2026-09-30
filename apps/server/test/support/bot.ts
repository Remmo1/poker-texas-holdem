import { serverMessageSchema } from '@holdem/shared';
import type { ServerMessage } from '@holdem/shared';
import WebSocket from 'ws';

type Message = ServerMessage & { id?: string };
type Waiter = { match: (m: Message) => boolean; resolve: (m: Message) => void };

export const waitUntil = async (condition: () => boolean, timeoutMs = 10_000, what = 'condition'): Promise<void> => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
};

/** Headless test client that speaks the wire protocol and validates everything it receives. */
export class Bot {
  readonly messages: Message[] = [];
  readonly protocolErrors: string[] = [];
  closeCode: number | null = null;
  seat: number | null = null;
  tableId = '';
  handId = '';
  handsEnded = 0;
  autoplay = false;

  private counter = 0;
  private readonly pending = new Map<string, (m: Message) => void>();
  private readonly waiters = new Set<Waiter>();

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => this.onMessage(data.toString()));
    socket.on('close', (code) => {
      this.closeCode = code;
    });
  }

  static async connect(url: string): Promise<Bot> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new Bot(socket);
  }

  /** Sends a command and resolves with the server's reply (ack, reject, auth.ok or pong). */
  request(type: string, payload: unknown, id = `c${++this.counter}`): Promise<Message> {
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.sendRaw(JSON.stringify({ v: 1, id, type, payload }));
    });
  }

  /** Like `request`, but fails the test on a rejection. */
  async ok(type: string, payload: unknown): Promise<Message> {
    const reply = await this.request(type, payload);
    if (reply.type === 'cmd.reject') throw new Error(`${type} rejected: ${reply.payload.code} ${reply.payload.message}`);
    return reply;
  }

  sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  waitFor(match: (m: Message) => boolean, timeoutMs = 10_000): Promise<Message> {
    const existing = this.messages.find(match);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error('Timed out waiting for message'));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  ofType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }

  close(): void {
    this.socket.close();
  }

  private onMessage(raw: string): void {
    const parsed = serverMessageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      this.protocolErrors.push(`${parsed.error.message} <- ${raw}`);
      return;
    }
    const message = parsed.data as Message;
    this.messages.push(message);

    if ('id' in message && message.id && this.pending.has(message.id)) {
      this.pending.get(message.id)!(message);
      this.pending.delete(message.id);
    }
    for (const waiter of this.waiters) {
      if (waiter.match(message)) {
        this.waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
    this.track(message);
  }

  private track(message: Message): void {
    switch (message.type) {
      case 'hand.started':
        this.handId = message.payload.handId;
        break;
      case 'table.snapshot':
        if (message.payload.hand) this.handId = message.payload.hand.handId;
        break;
      case 'hand.ended':
        this.handsEnded++;
        break;
      case 'action.requested':
        if (this.autoplay && message.payload.seat === this.seat) {
          const { legal, actionSeq } = message.payload;
          void this.request('table.action', {
            tableId: this.tableId,
            handId: this.handId,
            actionSeq,
            action: { type: legal.canCheck ? 'check' : 'call' },
          });
        }
        break;
      default:
    }
  }
}
