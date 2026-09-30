import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { TableSummary } from '@holdem/shared';
import { createApp } from '../../src/bootstrap.js';
import type { AppConfig } from '../../src/config/config.js';
import { OutboxRelay } from '../../src/infra/event-bus/outbox-relay.js';
import { EVENT_BUS, InProcessEventBus } from '../../src/infra/event-bus/event-bus.js';
import { Bot } from './bot.js';
import { TEST_CONFIG, createTestDb } from './helpers.js';
import type { Db } from '../../src/infra/db/db.js';
import type { DeckSource } from '../../src/modules/table-runtime/fairness.js';

export interface TestServer {
  readonly app: INestApplication;
  readonly db: Db;
  readonly http: string;
  readonly ws: string;
  post(path: string, body: unknown, token?: string): Promise<{ status: number; body: any }>;
  register(username: string): Promise<{ userId: string; token: string }>;
  connectBot(user: { token: string }): Promise<Bot>;
  tables(): Promise<TableSummary[]>;
  relay(): OutboxRelay;
  bus(): InProcessEventBus;
  stop(): Promise<void>;
}

export async function startServer(options: { config?: Partial<AppConfig>; deckSource?: DeckSource } = {}): Promise<TestServer> {
  const db = await createTestDb();
  const app = await createApp({
    db,
    config: { ...TEST_CONFIG, ...options.config },
    logger: false,
    ...(options.deckSource ? { deckSource: options.deckSource } : {}),
  });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const http = `http://127.0.0.1:${port}`;

  const post: TestServer['post'] = async (path, body, token) => {
    const response = await fetch(`${http}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  return {
    app,
    db,
    http,
    ws: `ws://127.0.0.1:${port}/ws`,
    post,
    async register(username) {
      const password = 'correct-horse-battery';
      const created = await post('/auth/register', { username, password });
      if (created.status !== 201) throw new Error(`register failed: ${created.status}`);
      const login = await post('/auth/login', { username, password });
      return { userId: created.body.userId as string, token: login.body.accessToken as string };
    },
    async connectBot(user) {
      const ticket = await post('/auth/ws-ticket', {}, user.token);
      const bot = await Bot.connect(`ws://127.0.0.1:${port}/ws`);
      const reply = await bot.request('auth.hello', { ticket: ticket.body.ticket });
      if (reply.type !== 'auth.ok') throw new Error(`auth failed: ${JSON.stringify(reply)}`);
      return bot;
    },
    async tables() {
      return (await (await fetch(`${http}/tables`)).json()) as TableSummary[];
    },
    relay: () => app.get(OutboxRelay),
    bus: () => app.get(EVENT_BUS) as InProcessEventBus,
    async stop() {
      await app.close();
      await db.close();
    },
  };
}
