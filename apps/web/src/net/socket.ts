import { PROTOCOL_VERSION, serverMessageSchema } from '@holdem/shared';
import type { ErrorCode, ServerMessage } from '@holdem/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
/** Why the socket stopped for good; the caller decides what to tell the user. */
export type FatalReason = 'replaced' | 'auth';

export class CommandError extends Error {
  constructor(
    readonly code: ErrorCode | 'NOT_CONNECTED' | 'TIMEOUT',
    message: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

/** Thrown by `getTicket` when the user's login is no longer valid, so retrying cannot help. */
export class AuthExpiredError extends Error {}

export interface WebSocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface SocketHandlers {
  /** Called after every successful (re)authentication; rejoin tables here. */
  onReady(): void;
  onMessage(message: ServerMessage): void;
  onStatus(status: ConnectionStatus, fatal?: FatalReason): void;
}

export interface SocketOptions {
  readonly url: string;
  readonly getTicket: () => Promise<string>;
  readonly createSocket?: (url: string) => WebSocketLike;
  readonly random?: () => number;
}

const OPEN = 1;
const CLOSE_REPLACED = 4000;
const REQUEST_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 15_000;
const MAX_BACKOFF_MS = 10_000;

interface Pending {
  resolve(message: ServerMessage): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** One authenticated WebSocket that reconnects on its own with a fresh ticket each time. */
export class GameSocket {
  private ws: WebSocketLike | null = null;
  private readonly pending = new Map<string, Pending>();
  private counter = 0;
  private attempt = 0;
  private running = false;
  private authenticated = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private clockOffset = 0;

  constructor(
    private readonly options: SocketOptions,
    private readonly handlers: SocketHandlers,
  ) {}

  get isOpen(): boolean {
    return this.authenticated && this.ws?.readyState === OPEN;
  }

  /** Server time estimate in ms, corrected by the measured offset. */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close(1000, 'client closing');
    this.teardown(new CommandError('NOT_CONNECTED', 'Connection closed'));
    this.handlers.onStatus('closed');
  }

  request(type: string, payload: unknown): Promise<ServerMessage> {
    if (!this.isOpen) return Promise.reject(new CommandError('NOT_CONNECTED', 'Not connected'));
    return this.send(type, payload);
  }

  private send(type: string, payload: unknown): Promise<ServerMessage> {
    const ws = this.ws;
    if (!ws) return Promise.reject(new CommandError('NOT_CONNECTED', 'Not connected'));
    const id = `c${++this.counter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CommandError('TIMEOUT', 'The server did not answer in time'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, id, type, payload }));
    });
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    this.handlers.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    let ticket: string;
    try {
      ticket = await this.options.getTicket();
    } catch (error) {
      if (error instanceof AuthExpiredError) return this.fail('auth');
      return this.scheduleRetry();
    }
    if (!this.running) return;

    const ws = (this.options.createSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike))(this.options.url);
    this.ws = ws;
    ws.onopen = () => void this.authenticate(ws, ticket);
    ws.onmessage = (event) => this.onData(event.data);
    ws.onclose = (event) => this.onClose(ws, event.code);
  }

  private async authenticate(ws: WebSocketLike, ticket: string): Promise<void> {
    try {
      const sentAt = Date.now();
      const reply = await this.send('auth.hello', { ticket });
      if (reply.type !== 'auth.ok') throw new Error('Unexpected reply');
      this.updateClock(reply.payload.serverTime, sentAt);
      this.authenticated = true;
      this.attempt = 0;
      this.handlers.onStatus('open');
      this.startHeartbeat();
      this.handlers.onReady();
    } catch {
      ws.close(4001, 'authentication failed');
    }
  }

  private onData(data: unknown): void {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      return;
    }
    const parsed = serverMessageSchema.safeParse(json);
    if (!parsed.success) {
      console.warn('Dropped a message that does not match the protocol', parsed.error.message);
      return;
    }
    const message = parsed.data;

    const id = 'id' in message ? message.id : undefined;
    const waiting = id ? this.pending.get(id) : undefined;
    if (id && waiting) {
      this.pending.delete(id);
      clearTimeout(waiting.timer);
      if (message.type === 'cmd.reject') waiting.reject(new CommandError(message.payload.code, message.payload.message));
      else waiting.resolve(message);
      return;
    }
    this.handlers.onMessage(message);
  }

  private onClose(ws: WebSocketLike, code: number): void {
    if (this.ws !== ws) return;
    this.teardown(new CommandError('NOT_CONNECTED', 'Connection lost'));
    if (!this.running) return;
    if (code === CLOSE_REPLACED) return this.fail('replaced');
    this.scheduleRetry();
  }

  private fail(reason: FatalReason): void {
    this.running = false;
    this.handlers.onStatus('closed', reason);
  }

  private scheduleRetry(): void {
    if (!this.running) return;
    const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt++);
    const delay = base * (0.5 + (this.options.random ?? Math.random)() / 2);
    this.handlers.onStatus('reconnecting');
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private teardown(error: Error): void {
    this.authenticated = false;
    this.ws = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }

  private startHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      const sentAt = Date.now();
      this.send('ping', {}).then(
        (reply) => {
          if (reply.type === 'pong') this.updateClock(reply.payload.serverTime, sentAt);
        },
        () => this.ws?.close(4002, 'heartbeat timeout'),
      );
    }, HEARTBEAT_MS);
  }

  /** Assumes the server stamped its time halfway through the round trip. */
  private updateClock(serverTime: number, sentAt: number): void {
    const receivedAt = Date.now();
    this.clockOffset = serverTime - (sentAt + receivedAt) / 2;
  }
}
