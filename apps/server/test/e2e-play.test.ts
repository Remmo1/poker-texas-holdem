import { cardToString, parseCards, replay } from '@holdem/poker-engine';
import type { HandEvent } from '@holdem/poker-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commitDeck } from '../src/modules/table-runtime/fairness.js';
import { reviveBigints } from '../src/infra/json.js';
import type { OutboxMessage } from '../src/infra/event-bus/event-bus.js';
import { assertLedgerConsistent } from './support/helpers.js';
import { startServer, type TestServer } from './support/server.js';
import { waitUntil } from './support/bot.js';

describe('two bots play full hands over WebSocket', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(() => server.stop());

  it('persists, replays and reconciles every hand, and never leaks private cards', async () => {
    const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map((n) => server.register(n)));
    const [table] = await server.tables();
    const tableId = table!.id;
    const [a, b, spectator] = await Promise.all([alice!, bob!, carol!].map((u) => server.connectBot(u)));

    const seen: OutboxMessage[] = [];
    server.bus().subscribe((m) => void seen.push(m));

    for (const [bot, seat] of [[a!, 0], [b!, 1], [spectator!, null]] as const) {
      bot.tableId = tableId;
      bot.seat = seat;
      await bot.ok('table.join', { tableId });
    }
    a!.autoplay = b!.autoplay = true;
    await a!.ok('table.sit', { tableId, seat: 0, buyIn: '1000' });
    await b!.ok('table.sit', { tableId, seat: 1, buyIn: '1000' });

    await waitUntil(() => a!.handsEnded >= 5 && b!.handsEnded >= 5, 30_000, 'five hands');
    await a!.ok('table.stand', { tableId });
    await b!.ok('table.stand', { tableId });
    await waitUntil(() => a!.ofType('player.left').length > 0 && b!.ofType('player.left').length > 0, 15_000, 'both players to leave');
    await waitUntil(() => spectator!.ofType('player.left').length === 2, 15_000, 'spectator to see both leave');

    // Wire protocol: every message the clients received matched the shared schemas.
    for (const bot of [a!, b!, spectator!]) expect(bot.protocolErrors).toEqual([]);

    // Privacy: hole cards only ever reach their owner; the spectator never sees any.
    for (const bot of [a!, b!, spectator!]) {
      for (const m of bot.ofType('cards.dealt')) if (m.payload.cards) expect(m.payload.seat).toBe(bot.seat);
    }
    expect(spectator!.ofType('cards.dealt').every((m) => m.payload.cards === undefined)).toBe(true);
    expect(a!.ofType('cards.dealt').filter((m) => m.payload.cards).length).toBeGreaterThanOrEqual(5);

    // Sequence numbers are strictly consecutive after the join snapshot.
    for (const bot of [a!, b!, spectator!]) {
      const snapshot = bot.ofType('table.snapshot')[0]!;
      const seqs = bot.messages.filter((m) => 'seq' in m && m.type !== 'table.snapshot').map((m) => (m as { seq: number }).seq);
      expect(seqs).toEqual(seqs.map((_, i) => snapshot.seq + 1 + i));
    }

    // Every hand is complete, replays to its recorded result, and matches its deck commitment.
    const hands = await server.db.query<{ id: string; status: string; deck_commit: string; deck_salt: string; deck_reveal: string[] }>(
      `SELECT id, status, deck_commit, deck_salt, deck_reveal FROM hands ORDER BY hand_no`,
    );
    expect(hands.rowCount).toBeGreaterThanOrEqual(5);
    let totalEvents = 0;
    for (const hand of hands.rows) {
      expect(hand.status).toBe('complete');
      expect(commitDeck(parseCards(hand.deck_reveal.join(' ')), hand.deck_salt)).toBe(hand.deck_commit);

      const stored = await server.db.query<{ payload: unknown }>(`SELECT payload FROM hand_events WHERE hand_id = $1 ORDER BY seq`, [hand.id]);
      totalEvents += stored.rowCount;
      const state = replay(stored.rows.map((r) => reviveBigints<HandEvent>(r.payload)));
      const recorded = await server.db.query<{ end_stack: string }>(
        `SELECT end_stack::text FROM hand_players WHERE hand_id = $1 ORDER BY seat_index`,
        [hand.id],
      );
      expect(recorded.rows.map((r) => r.end_stack)).toEqual(state.seats.map((s) => s.stack.toString()));
      expect(state.deck.length).toBeLessThan(52);
      // The revealed deck is exactly the one the engine dealt from.
      expect(hand.deck_reveal).toEqual((await deckOf(server, hand.id)).map(cardToString));
    }

    // Money: chips only moved between wallets and the table; nothing was created or lost.
    await assertLedgerConsistent(server.db);
    const wallets = await server.db.query<{ total: string }>(`SELECT SUM(balance)::text AS total FROM accounts WHERE owner_type = 'user'`);
    expect(wallets.rows[0]!.total).toBe('30000');
    expect((await server.tables())[0]!.seated).toBe(0);

    // Outbox: every persisted event is published once, in order.
    const published = await server.relay().drain();
    expect(published).toBe(totalEvents);
    expect(seen.map((m) => m.id)).toEqual([...seen.map((m) => m.id)].sort((x, y) => x - y));
    expect(seen[0]!.type).toBe('HandStarted');
    expect(await server.relay().drain()).toBe(0);

    [a, b, spectator].forEach((bot) => bot!.close());
  });
});

async function deckOf(server: TestServer, handId: string) {
  const first = await server.db.query<{ payload: unknown }>(`SELECT payload FROM hand_events WHERE hand_id = $1 AND seq = 0`, [handId]);
  return (reviveBigints<HandEvent>(first.rows[0]!.payload) as Extract<HandEvent, { type: 'HandStarted' }>).deck;
}
