import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthExpiredError, CommandError, GameSocket } from '../src/net/socket';
import type { ConnectionStatus, FatalReason } from '../src/net/socket';
import { fakeSocketFactory } from './support/fake-socket';
import { ack, event, reject } from './support/messages';

function setup(options: { getTicket?: () => Promise<string>; configure?: Parameters<typeof fakeSocketFactory>[0] } = {}) {
  const factory = fakeSocketFactory(options.configure);
  const statuses: (ConnectionStatus | `closed:${FatalReason}`)[] = [];
  const messages: unknown[] = [];
  let ready = 0;
  let ticket = 0;
  const socket = new GameSocket(
    {
      url: 'ws://test/ws',
      getTicket: options.getTicket ?? (async () => `ticket-${++ticket}`),
      createSocket: factory.create,
      random: () => 1,
    },
    {
      onReady: () => void ready++,
      onMessage: (m) => void messages.push(m),
      onStatus: (s, fatal) => void statuses.push(fatal ? `closed:${fatal}` : s),
    },
  );
  return { socket, factory, statuses, messages, readyCount: () => ready };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameSocket', () => {
  it('authenticates with a ticket before reporting ready', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(t.factory.last.url).toBe('ws://test/ws');
    expect(t.factory.last.requests('auth.hello')[0]!.payload).toEqual({ ticket: 'ticket-1' });
    expect(t.statuses).toEqual(['connecting', 'open']);
    expect(t.readyCount()).toBe(1);
    expect(t.socket.isOpen).toBe(true);
    t.socket.stop();
  });

  it('resolves requests with the reply and rejects with the server\'s error code', async () => {
    const t = setup({
      configure: (s) => {
        const auth = s.respond;
        s.respond = (m) => (m.type === 'table.sit' ? [reject(m.id, 'SEAT_TAKEN', 'Seat is taken')] : auth(m));
      },
    });
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);

    await expect(t.socket.request('table.join', {})).resolves.toMatchObject({ type: 'cmd.ack' });
    await expect(t.socket.request('table.sit', {})).rejects.toMatchObject({ code: 'SEAT_TAKEN', message: 'Seat is taken' });
    t.socket.stop();
  });

  it('refuses commands while not connected', async () => {
    const t = setup();
    await expect(t.socket.request('ping', {})).rejects.toBeInstanceOf(CommandError);
  });

  it('passes unsolicited messages on and drops ones that break the protocol', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);

    t.factory.last.receive(event(1, 'player.left', { seat: 1, userId: 'u' }));
    t.factory.last.receive({ v: 1, type: 'player.left', tableId: 't1', seq: 2, ts: 1, payload: { seat: 'nope' } });
    t.factory.last.receive('not json');
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ type: 'player.left', seq: 1 });
    t.socket.stop();
  });

  it('reconnects with a fresh ticket and backs off between attempts', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    t.factory.last.close(1006);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.statuses.at(-1)).toBe('reconnecting');
    expect(t.socket.isOpen).toBe(false);

    await vi.advanceTimersByTimeAsync(499);
    expect(t.factory.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.factory.sockets).toHaveLength(2);
    expect(t.factory.last.requests('auth.hello')[0]!.payload).toEqual({ ticket: 'ticket-2' });
    expect(t.readyCount()).toBe(2);
    expect(t.statuses.at(-1)).toBe('open');

    // A successful login resets the backoff, so the next drop retries after the base delay again.
    t.factory.last.close(1006);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.factory.sockets).toHaveLength(3);
    t.socket.stop();
  });

  it('fails pending requests when the connection drops', async () => {
    const t = setup({
      configure: (s) => {
        const auth = s.respond;
        s.respond = (m) => (m.type === 'auth.hello' ? auth(m) : []);
      },
    });
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    const pending = t.socket.request('table.stand', {});
    const assertion = expect(pending).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    t.factory.last.close(1006);
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    t.socket.stop();
  });

  it('times out a request the server never answers', async () => {
    const t = setup({
      configure: (s) => {
        const auth = s.respond;
        s.respond = (m) => (m.type === 'auth.hello' ? auth(m) : []);
      },
    });
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    const pending = t.socket.request('table.stand', {});
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
    t.socket.stop();
  });

  it('stops for good when the server replaces the session (close 4000)', async () => {
    const t = setup();
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    t.factory.last.close(4000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.statuses.at(-1)).toBe('closed:replaced');
    expect(t.factory.sockets).toHaveLength(1);
  });

  it('stops for good when the login is no longer valid', async () => {
    const t = setup({ getTicket: async () => Promise.reject(new AuthExpiredError()) });
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.statuses.at(-1)).toBe('closed:auth');
    expect(t.factory.sockets).toHaveLength(0);
  });

  it('retries when the ticket request fails for another reason', async () => {
    let calls = 0;
    const t = setup({
      getTicket: async () => {
        if (++calls === 1) throw new Error('network down');
        return 'ok';
      },
    });
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.factory.sockets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.factory.sockets).toHaveLength(1);
    expect(t.statuses.at(-1)).toBe('open');
    t.socket.stop();
  });

  it('drops the connection when a heartbeat goes unanswered, which triggers a reconnect', async () => {
    const t = setup({
      configure: (s) => {
        const auth = s.respond;
        s.respond = (m) => (m.type === 'ping' ? [] : auth(m));
      },
    });
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000 + 10_001); // ping sent, then times out
    await vi.advanceTimersByTimeAsync(600);
    expect(t.factory.sockets.length).toBeGreaterThanOrEqual(2);
    t.socket.stop();
  });

  it('estimates the server clock from replies', async () => {
    const t = setup({
      configure: (s) => {
        s.respond = (m) =>
          m.type === 'auth.hello'
            ? [{ v: 1, type: 'auth.ok', id: m.id, ts: 1, payload: { userId: 'u', username: 'a', serverTime: Date.now() + 5_000 } }]
            : [ack(m.id)];
      },
    });
    t.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.socket.serverNow() - Date.now()).toBeGreaterThanOrEqual(4_990);
    expect(t.socket.serverNow() - Date.now()).toBeLessThanOrEqual(5_010);
    t.socket.stop();
  });
});
