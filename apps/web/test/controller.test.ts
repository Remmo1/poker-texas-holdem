import { createHash } from 'node:crypto';
import { deckCommitPreimage } from '@holdem/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/net/api';
import type { Api } from '../src/net/api';
import { GameController } from '../src/net/controller';
import { createAppStore } from '../src/state/store';
import { fakeSocketFactory, flush } from './support/fake-socket';
import type { FakeWebSocket } from './support/fake-socket';
import { ack, ALICE, authOk, headsUpHand, reject, snapshot, snapshotMessage, TABLE_ID } from './support/messages';

const commit = (deck: string[], salt: string) => createHash('sha256').update(deckCommitPreimage(deck, salt)).digest('hex');

const fullDeck = (): string[] => [...'cdhs'].flatMap((s) => [...'23456789TJQKA'].map((r) => `${r}${s}`));

function setup(overrides: Partial<Api> = {}, configure?: (socket: FakeWebSocket) => void) {
  const store = createAppStore();
  const factory = fakeSocketFactory(configure);
  const storage = new Map<string, string>();
  const api: Api = {
    register: async () => undefined,
    login: async () => ({ accessToken: 'jwt', expiresIn: 900 }),
    me: async () => ({ ...ALICE, balance: 10_000n }),
    wsTicket: async () => 'ticket',
    tables: async () => [],
    ...overrides,
  };
  const controller = new GameController({
    api,
    store,
    wsUrl: 'ws://test/ws',
    createSocket: factory.create,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
  });
  return { controller, store, factory, storage };
}

/** Opens the table and lets the fake server deliver a snapshot in reply to the join. */
async function openWithSnapshot(t: ReturnType<typeof setup>, seq = 0, payload = snapshot()) {
  await t.controller.login('alice', 'pw');
  t.controller.openTable(TABLE_ID);
  await flush();
  const socket = t.factory.last;
  socket.receive(snapshotMessage(seq, payload));
  await flush();
  return socket;
}

const sent = (socket: FakeWebSocket, type: string) => socket.requests(type);
let active: GameController | null = null;
afterEach(() => {
  active?.logout();
  active = null;
});

describe('GameController: session', () => {
  it('logs in, loads the balance and remembers the token for the tab', async () => {
    const t = setup();
    active = t.controller;
    expect(await t.controller.login('alice', 'pw')).toBe(true);
    expect(t.store.getState()).toMatchObject({ session: { userId: 'u-alice', username: 'alice', token: 'jwt' }, balance: 10_000n });
    expect(t.storage.get('holdem.token')).toBe('jwt');
  });

  it('shows the server\'s message when login fails and stays signed out', async () => {
    const t = setup({ login: async () => Promise.reject(new ApiError(401, 'Invalid credentials')) });
    expect(await t.controller.login('alice', 'wrong')).toBe(false);
    expect(t.store.getState().session).toBeNull();
    expect(t.store.getState().notice).toMatchObject({ kind: 'error', text: 'Invalid credentials' });
  });

  it('restores a stored session and drops a stale token', async () => {
    const good = setup();
    active = good.controller;
    good.storage.set('holdem.token', 'jwt');
    await good.controller.restoreSession();
    expect(good.store.getState().session?.username).toBe('alice');

    const stale = setup({ me: async () => Promise.reject(new ApiError(401, 'Invalid or expired token')) });
    stale.storage.set('holdem.token', 'old');
    await stale.controller.restoreSession();
    expect(stale.store.getState().session).toBeNull();
    expect(stale.storage.has('holdem.token')).toBe(false);
  });

  it('logout closes the connection and clears everything', async () => {
    const t = setup();
    await openWithSnapshot(t);
    t.controller.logout();
    expect(t.store.getState()).toMatchObject({ session: null, view: null, tableId: null });
    expect(t.storage.has('holdem.token')).toBe(false);
  });
});

describe('GameController: table', () => {
  it('joins after authenticating and shows the snapshot', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 7, snapshot({ name: 'Micro' }));

    expect(sent(socket, 'table.join')[0]!.payload).toEqual({ tableId: TABLE_ID });
    expect(t.store.getState().view).toMatchObject({ name: 'Micro', seq: 7 });
  });

  it('applies events in order, ignores duplicates and ignores other tables', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);

    const script = headsUpHand(['x'], 's', 'c');
    socket.receive(script[0]); // seq 1
    socket.receive(script[0]); // duplicate
    socket.receive({ ...script[1], tableId: 'other' } as never);
    socket.receive(script[1]); // seq 2
    await flush();

    const view = t.store.getState().view!;
    expect(view.seq).toBe(2);
    expect(Object.keys(view.seats)).toEqual(['0', '1']);
    expect(view.mySeat).toBe(0);
    expect(sent(socket, 'sync.resume')).toHaveLength(0);
  });

  it('asks the server to resume from its last seq when an event is missing', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    const script = headsUpHand(['x'], 's', 'c');
    socket.receive(script[0]);
    socket.receive(script[3]); // seq 4: seqs 2 and 3 were lost
    socket.receive(script[4]); // seq 5: still in the gap, must not trigger a second request
    await flush();

    expect(t.store.getState().view!.seq).toBe(1);
    expect(sent(socket, 'sync.resume').map((m) => m.payload)).toEqual([{ tableId: TABLE_ID, lastSeq: 1 }]);

    // The server replays the missing events, then everything is applied in order.
    for (const e of script.slice(1, 5)) socket.receive(e);
    await flush();
    expect(t.store.getState().view!.seq).toBe(5);
  });

  it('recovers from a snapshot sent in reply to a resume', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    socket.receive(headsUpHand(['x'], 's', 'c')[5]); // seq 6 with nothing before it
    await flush();
    socket.receive(snapshotMessage(20, snapshot({ name: 'Fresh' })));
    await flush();
    expect(t.store.getState().view).toMatchObject({ name: 'Fresh', seq: 20 });
  });

  it('rejoins the table after the connection drops and comes back', async () => {
    const t = setup();
    active = t.controller;
    const first = await openWithSnapshot(t, 5);
    first.close(1006);
    await flush();
    expect(t.store.getState().connection).toBe('reconnecting');

    await new Promise((r) => setTimeout(r, 600)); // backoff
    await flush();
    const second = t.factory.last;
    expect(second).not.toBe(first);
    expect(sent(second, 'table.join')).toHaveLength(1);
    second.receive(snapshotMessage(9, snapshot({ name: 'After reconnect' })));
    await flush();
    expect(t.store.getState()).toMatchObject({ connection: 'open', view: { name: 'After reconnect', seq: 9 } });
  });

  it('tells the user when another window took over the session', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t);
    socket.close(4000);
    await flush();
    expect(t.store.getState()).toMatchObject({ tableId: null, view: null, notice: { kind: 'error' } });
  });

  it('leaves the table view when the server says it does not exist', async () => {
    const t = setup({}, (socket) => {
      socket.respond = (m) =>
        m.type === 'auth.hello' ? [authOk(m.id)] : m.type === 'table.join' ? [reject(m.id, 'TABLE_NOT_FOUND', 'Table not found')] : [ack(m.id)];
    });
    active = t.controller;
    await t.controller.login('alice', 'pw');
    t.controller.openTable('missing');
    await flush();
    expect(t.store.getState()).toMatchObject({ tableId: null, view: null, notice: { kind: 'error', text: 'Table not found' } });
  });
});

describe('GameController: acting', () => {
  const setupMyTurn = async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    for (const e of headsUpHand(['x'], 's', 'c').slice(0, 8)) socket.receive(e);
    await flush();
    return { t, socket };
  };

  it('sends the hand id and action sequence the server asked for', async () => {
    const { t, socket } = await setupMyTurn();
    expect(await t.controller.act({ type: 'call' })).toBe(true);
    expect(sent(socket, 'table.action')[0]!.payload).toEqual({
      tableId: TABLE_ID,
      handId: 'h1',
      actionSeq: 0,
      action: { type: 'call' },
    });
  });

  it('does not send anything when it is not my turn', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    for (const e of headsUpHand(['x'], 's', 'c').slice(0, 9)) socket.receive(e); // my call was applied
    await flush();
    expect(await t.controller.act({ type: 'check' })).toBe(false);
    expect(sent(socket, 'table.action')).toHaveLength(0);
  });

  it('surfaces a rejection from the server as a notice', async () => {
    const { t, socket } = await setupMyTurn();
    socket.respond = (m) => [reject(m.id, 'STALE_SEQ', 'Action is out of date')];
    expect(await t.controller.act({ type: 'call' })).toBe(false);
    expect(t.store.getState().notice).toMatchObject({ kind: 'error', text: 'Action is out of date' });
  });

  it('sits with the buy-in as a string and refreshes the wallet', async () => {
    let balance = 10_000n;
    const t = setup({ me: async () => ({ ...ALICE, balance }) });
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);

    balance = 9_200n;
    expect(await t.controller.sit(2, 800n)).toBe(true);
    await flush();
    expect(sent(socket, 'table.sit')[0]!.payload).toEqual({ tableId: TABLE_ID, seat: 2, buyIn: '800' });
    expect(t.store.getState().balance).toBe(9_200n);
  });
});

describe('GameController: leaving', () => {
  it('stands a seated player up before going back to the lobby', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    for (const e of headsUpHand(fullDeck(), 's', 'c').slice(0, 2)) socket.receive(e); // alice is seated
    await flush();

    await t.controller.leaveTable();
    expect(sent(socket, 'table.stand')).toHaveLength(1);
    expect(sent(socket, 'table.leave')).toHaveLength(1);
    expect(t.store.getState()).toMatchObject({ tableId: null, view: null });
  });

  it('just leaves when only watching', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    await t.controller.leaveTable();
    expect(sent(socket, 'table.stand')).toHaveLength(0);
    expect(sent(socket, 'table.leave')).toHaveLength(1);
  });
});

describe('GameController: last hand', () => {
  it('keeps the last result when a snapshot replaces the view, and records the deck check on it', async () => {
    const deck = fullDeck();
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    for (const e of headsUpHand(deck, 'salt', commit(deck, 'salt'))) socket.receive(e);
    await flush();
    await vi.waitFor(() => expect(t.store.getState().view?.lastResult?.fairnessVerified).toBe(true));

    socket.receive(snapshotMessage(40, snapshot({ name: 'Fresh' })));
    await flush();
    const view = t.store.getState().view!;
    expect(view).toMatchObject({ name: 'Fresh', seq: 40 });
    expect(view.lastResult).toMatchObject({ handNo: 1, fairnessVerified: true });
  });
});

describe('GameController: fairness', () => {
  it('verifies the revealed deck against the commitment made before the deal', async () => {
    const deck = fullDeck();
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    for (const e of headsUpHand(deck, 'salt', commit(deck, 'salt'))) socket.receive(e);
    await flush();
    await vi.waitFor(() => expect(t.store.getState().view?.hand?.fairnessVerified).toBe(true));
  });

  it('flags a deck that does not match the commitment', async () => {
    const t = setup();
    active = t.controller;
    const socket = await openWithSnapshot(t, 0);
    for (const e of headsUpHand(fullDeck().reverse(), 'salt', commit(fullDeck(), 'salt'))) socket.receive(e);
    await flush();
    await vi.waitFor(() => expect(t.store.getState().view?.hand?.fairnessVerified).toBe(false));
    expect(t.store.getState().notice).toMatchObject({ kind: 'error' });
  });
});
