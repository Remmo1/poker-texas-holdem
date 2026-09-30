import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Bot, waitUntil } from './support/bot.js';
import { startServer } from './support/server.js';
import type { TestServer } from './support/server.js';

let server: TestServer;
let users = 0;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.stop());

const newUser = () => server.register(`player${++users}`);
const tableIdOf = async (): Promise<string> => (await server.tables())[0]!.id;

describe('REST auth', () => {
  it('registers, logs in and issues tickets; rejects bad input', async () => {
    const first = await server.post('/auth/register', { username: 'dupe', password: 'long-enough-1' });
    expect(first.status).toBe(201);
    expect((await server.post('/auth/register', { username: 'DUPE', password: 'long-enough-1' })).status).toBe(409);
    expect((await server.post('/auth/register', { username: 'x', password: 'long-enough-1' })).status).toBe(400);
    expect((await server.post('/auth/register', { username: 'okname', password: 'short' })).status).toBe(400);

    expect((await server.post('/auth/login', { username: 'dupe', password: 'wrong-password' })).status).toBe(401);
    expect((await server.post('/auth/login', { username: 'nobody', password: 'long-enough-1' })).status).toBe(401);
    expect((await server.post('/auth/ws-ticket', {})).status).toBe(401);
    expect((await server.post('/auth/ws-ticket', {}, 'not-a-jwt')).status).toBe(401);

    const login = await server.post('/auth/login', { username: 'dupe', password: 'long-enough-1' });
    expect(login.status).toBe(200);
    expect((await server.post('/auth/ws-ticket', {}, login.body.accessToken)).body.ticket).toEqual(expect.any(String));
  });

  it('grants the welcome bonus from the house, never stores plaintext passwords', async () => {
    const user = await newUser();
    const balance = await server.db.query<{ balance: string }>(
      `SELECT balance::text FROM accounts WHERE owner_type = 'user' AND owner_id = $1`,
      [user.userId],
    );
    expect(balance.rows[0]!.balance).toBe('10000');
    const hash = await server.db.query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [user.userId]);
    expect(hash.rows[0]!.password_hash).toMatch(/^scrypt\$/);
    expect(hash.rows[0]!.password_hash).not.toContain('correct-horse');
  });

  it('reports the signed-in user and wallet balance on /auth/me', async () => {
    const user = await newUser();
    const response = await fetch(`${server.http}/auth/me`, { headers: { authorization: `Bearer ${user.token}` } });
    expect(await response.json()).toMatchObject({ userId: user.userId, balance: '10000' });
    expect((await fetch(`${server.http}/auth/me`)).status).toBe(401);
  });
});

describe('WebSocket gateway hardening', () => {
  it('closes connections that send commands before authenticating', async () => {
    const bot = await Bot.connect(server.ws);
    const reply = await bot.request('table.join', { tableId: 'x' });
    expect(reply).toMatchObject({ type: 'cmd.reject', payload: { code: 'UNAUTHENTICATED' } });
    await waitUntil(() => bot.closeCode === 4001, 3000, 'close');
  });

  it('rejects invalid and reused tickets', async () => {
    const user = await newUser();
    const bad = await Bot.connect(server.ws);
    expect(await bad.request('auth.hello', { ticket: 'forged' })).toMatchObject({ payload: { code: 'UNAUTHENTICATED' } });
    await waitUntil(() => bad.closeCode === 4001, 3000, 'close');

    const { body } = await server.post('/auth/ws-ticket', {}, user.token);
    const first = await Bot.connect(server.ws);
    expect((await first.request('auth.hello', { ticket: body.ticket })).type).toBe('auth.ok');
    const replay = await Bot.connect(server.ws);
    expect(await replay.request('auth.hello', { ticket: body.ticket })).toMatchObject({ payload: { code: 'UNAUTHENTICATED' } });
    first.close();
  });

  it('survives malformed input and unknown tables', async () => {
    const bot = await server.connectBot(await newUser());
    bot.sendRaw('{not json');
    bot.sendRaw(JSON.stringify({ v: 1, id: 'z', type: 'table.explode', payload: {} }));
    bot.sendRaw('x'.repeat(10_000));
    await waitUntil(() => bot.ofType('cmd.reject').length === 3, 3000, 'three rejections');
    expect(bot.ofType('cmd.reject').every((m) => m.payload.code === 'BAD_REQUEST')).toBe(true);

    expect(await bot.request('table.join', { tableId: 'missing' })).toMatchObject({ payload: { code: 'TABLE_NOT_FOUND' } });
    expect((await bot.request('ping', {})).type).toBe('pong');
    expect(bot.socket.readyState).toBe(bot.socket.OPEN);
    bot.close();
  });

  it('answers a repeated command id with the original reply instead of running it twice', async () => {
    const tableId = await tableIdOf();
    const bot = await server.connectBot(await newUser());
    await bot.ok('table.join', { tableId });

    const payload = { tableId, seat: 5, buyIn: '500' };
    const first = await bot.request('table.sit', payload, 'sit-1');
    const second = await bot.request('table.sit', payload, 'sit-1');
    expect(first.type).toBe('cmd.ack');
    expect(second).toEqual(first);

    // Without the id cache the same command would now fail as ALREADY_SEATED.
    expect(await bot.request('table.sit', { ...payload, seat: 4 }, 'sit-2')).toMatchObject({ payload: { code: 'ALREADY_SEATED' } });
    await bot.ok('table.stand', { tableId });
    bot.close();
  });

  it('requires joining a table before acting on it', async () => {
    const tableId = await tableIdOf();
    const bot = await server.connectBot(await newUser());
    expect(await bot.request('table.sit', { tableId, seat: 0, buyIn: '500' })).toMatchObject({ payload: { code: 'BAD_REQUEST' } });
    expect(await bot.request('table.action', { tableId, handId: 'h', actionSeq: 0, action: { type: 'fold' } })).toMatchObject({
      payload: { code: 'BAD_REQUEST' },
    });
    bot.close();
  });

  it('enforces turn order, sequence numbers and bet sizes on live hands', async () => {
    const tableId = await tableIdOf();
    const [first, second] = await Promise.all([newUser(), newUser()]);
    const [a, b] = await Promise.all([server.connectBot(first), server.connectBot(second)]);
    for (const [bot, seat] of [[a, 0], [b, 1]] as const) {
      bot.tableId = tableId;
      bot.seat = seat;
      await bot.ok('table.join', { tableId });
    }
    await a.ok('table.sit', { tableId, seat: 0, buyIn: '1000' });
    await b.ok('table.sit', { tableId, seat: 1, buyIn: '1000' });

    const request = await a.waitFor((m) => m.type === 'action.requested' && m.payload.seat === 0);
    if (request.type !== 'action.requested') throw new Error('unreachable');
    const { actionSeq } = request.payload;
    const action = (bot: Bot, seq: number, act: unknown) =>
      bot.request('table.action', { tableId, handId: a.handId, actionSeq: seq, action: act });

    expect(await action(b, actionSeq, { type: 'call' })).toMatchObject({ payload: { code: 'NOT_YOUR_TURN' } });
    expect(await action(a, actionSeq + 1, { type: 'call' })).toMatchObject({ payload: { code: 'STALE_SEQ' } });
    expect(await action(a, actionSeq, { type: 'raise', to: '21' })).toMatchObject({ payload: { code: 'INVALID_AMOUNT' } });
    expect(await action(a, actionSeq, { type: 'raise', to: 21 })).toMatchObject({ payload: { code: 'BAD_REQUEST' } });
    expect(await action(a, actionSeq, { type: 'check' })).toMatchObject({ payload: { code: 'ILLEGAL_ACTION' } });
    expect((await action(a, actionSeq, { type: 'call' })).type).toBe('cmd.ack');

    await a.ok('table.stand', { tableId });
    await b.ok('table.stand', { tableId });
    await waitUntil(() => a.ofType('player.left').length > 0 && b.ofType('player.left').length > 0, 10_000, 'players to leave');
    a.close();
    b.close();
  });

  it('closes the older connection when a user signs in again', async () => {
    const user = await newUser();
    const older = await server.connectBot(user);
    const newer = await server.connectBot(user);
    await waitUntil(() => older.closeCode === 4000, 3000, 'older connection to close');
    expect((await newer.request('ping', {})).type).toBe('pong');
    newer.close();
  });

  it('rate limits floods and disconnects persistent offenders', async () => {
    const bot = await server.connectBot(await newUser());
    for (let i = 0; i < 200; i++) bot.sendRaw(JSON.stringify({ v: 1, id: `p${i}`, type: 'ping', payload: {} }));
    await waitUntil(() => bot.ofType('cmd.reject').some((m) => m.payload.code === 'RATE_LIMITED'), 5000, 'rate limit');
    await waitUntil(() => bot.closeCode === 4008, 5000, 'disconnect');
  });
});
