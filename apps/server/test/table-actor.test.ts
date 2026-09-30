import { randomUUID } from 'node:crypto';
import { cardToString, replay } from '@holdem/poker-engine';
import type { HandEvent } from '@holdem/poker-engine';
import type { WireAction } from '@holdem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { reviveBigints } from '../src/infra/json.js';
import { commitDeck } from '../src/modules/table-runtime/fairness.js';
import { TableActor, viewerEvent } from '../src/modules/table-runtime/table-actor.js';
import type { Broadcast } from '../src/modules/table-runtime/table-actor.js';
import type { TableDefinition } from '../src/modules/table-runtime/table-config.js';
import { PgTableStore } from '../src/modules/table-runtime/table-store.js';
import { WalletService } from '../src/modules/wallet/wallet.service.js';
import { assertLedgerConsistent, createTestDb, createUser, scriptedDecks, stackedDeck } from './support/helpers.js';
import { ManualClock } from './support/manual-clock.js';

// Seat 0 (button, small blind): AA. Seat 1 (big blind): KK. Board is blank.
const HEADS_UP_DECK = 'Ah Kd Ac Kh 2c 7d 9s Jh 3d';

async function harness(decks: string[] = [HEADS_UP_DECK]) {
  const db = await createTestDb();
  const wallet = new WalletService(db);
  const store = new PgTableStore(db, wallet);
  const clock = new ManualClock();
  const definition: TableDefinition = {
    id: randomUUID(),
    name: 'Test',
    config: { maxSeats: 6, smallBlind: 10n, bigBlind: 20n, minBuyIn: 400n, maxBuyIn: 2000n, actionTimeMs: 20_000 },
  };
  await store.createTable(definition);

  const broadcasts: Broadcast[] = [];
  const errors: unknown[] = [];
  const makeActor = (restored: ConstructorParameters<typeof TableActor>[2] = { seats: [], lastHandNo: 0 }) =>
    new TableActor(
      definition,
      {
        store,
        clock,
        deckSource: scriptedDecks(...decks),
        handStartDelayMs: 10,
        publish: (_id, b) => broadcasts.push(b),
        onError: (_m, e) => errors.push(e),
      },
      restored,
    );
  const actor = makeActor();

  const alice = await createUser(db, wallet, 'alice');
  const bob = await createUser(db, wallet, 'bob');

  const startHand = async () => {
    clock.advance(10);
    await actor.whenIdle();
  };
  const act = (user: { userId: string }, action: WireAction) => {
    const hand = actor.snapshotFor(user.userId).hand!;
    return actor.act(user.userId, { handId: hand.handId, actionSeq: hand.actionSeq, action });
  };
  const seatBoth = async () => {
    await actor.sit(alice, 0, 1000n);
    await actor.sit(bob, 1, 1000n);
  };
  const stacks = () => Object.fromEntries(actor.snapshotFor(null).seats.map((s) => [s.seat, s.stack]));

  return { db, wallet, store, clock, definition, actor, makeActor, broadcasts, errors, alice, bob, startHand, act, seatBoth, stacks };
}

type Harness = Awaited<ReturnType<typeof harness>>;
let current: Harness | null = null;
const setup = async (decks?: string[]) => (current = await harness(decks));
afterEach(async () => {
  if (!current) return;
  expect(current.errors).toEqual([]);
  current.actor.dispose();
  await current.db.close();
  current = null;
});

describe('TableActor: a full hand', () => {
  it('plays a hand to showdown, persists it, and never leaks hidden cards', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();

    expect(h.actor.snapshotFor(null).hand).toMatchObject({ handNo: 1, toAct: 0, street: 'preflop', pot: '30' });

    await h.act(h.alice, { type: 'call' });
    await h.act(h.bob, { type: 'check' });
    for (let street = 0; street < 3; street++) {
      await h.act(h.bob, { type: 'check' });
      await h.act(h.alice, { type: 'check' });
    }

    expect(h.actor.snapshotFor(null).hand).toBeNull();
    expect(h.stacks()).toEqual({ 0: '1020', 1: '980' });

    // Persistence: events replay to the recorded result and the deck matches its commitment.
    const hand = (await h.db.query<{ id: string; status: string; deck_commit: string; deck_salt: string; deck_reveal: string[] }>(
      `SELECT id, status, deck_commit, deck_salt, deck_reveal FROM hands`,
    )).rows[0]!;
    expect(hand.status).toBe('complete');

    const stored = await h.db.query<{ payload: unknown }>(`SELECT payload FROM hand_events WHERE hand_id = $1 ORDER BY seq`, [hand.id]);
    const events = stored.rows.map((r) => reviveBigints<HandEvent>(r.payload));
    const replayed = replay(events);
    expect(replayed.status).toBe('complete');

    const endStacks = await h.db.query<{ seat_index: number; end_stack: string }>(
      `SELECT seat_index, end_stack::text FROM hand_players WHERE hand_id = $1 ORDER BY seat_index`,
      [hand.id],
    );
    expect(endStacks.rows.map((r) => r.end_stack)).toEqual(replayed.seats.map((s) => s.stack.toString()));
    expect(replayed.seats.map((s) => s.stack)).toEqual([1020n, 980n]);

    const deck = stackedDeck(HEADS_UP_DECK);
    expect(hand.deck_reveal).toEqual(deck.map(cardToString));
    expect(commitDeck(deck, hand.deck_salt)).toBe(hand.deck_commit);

    // Every persisted event is also queued on the outbox, and the deck is stripped from it.
    const outbox = await h.db.query<{ payload: { event: { type: string; deck?: unknown[] } } }>(`SELECT payload FROM outbox ORDER BY id`);
    expect(outbox.rowCount).toBe(events.length);
    expect(outbox.rows[0]!.payload.event.deck).toEqual([]);

    await assertLedgerConsistent(h.db);

    // Confidentiality: what each viewer received before the showdown.
    const showdownSeq = h.broadcasts.find((b) => b.public.type === 'showdown')!.seq;
    const endedSeq = h.broadcasts.find((b) => b.public.type === 'hand.ended')!.seq;
    const undealt = deck.slice(9).map(cardToString);
    const viewers: [number | null, string[]][] = [
      [0, ['Kd', 'Kh']],
      [1, ['Ah', 'Ac']],
      [null, ['Ah', 'Ac', 'Kd', 'Kh']],
    ];
    for (const [seat, hidden] of viewers) {
      for (const broadcast of h.broadcasts) {
        const json = JSON.stringify(viewerEvent(broadcast, seat));
        if (broadcast.seq < showdownSeq) for (const card of hidden) expect(json).not.toContain(`"${card}"`);
        if (broadcast.seq < endedSeq) {
          for (const card of undealt) expect(json).not.toContain(`"${card}"`);
          expect(json).not.toContain('"deck"');
        }
      }
    }

    const ended = h.broadcasts.find((b) => b.public.type === 'hand.ended')!.public;
    expect(ended.type === 'hand.ended' && ended.payload.deck).toEqual(deck.map(cardToString));
  });

  it('delivers hole cards only to their owner, with gapless sequence numbers', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();

    const dealt = h.broadcasts.filter((b) => b.public.type === 'cards.dealt');
    expect(dealt).toHaveLength(2);
    for (const b of dealt) {
      const seat = b.forSeat!.seat;
      expect(viewerEvent(b, seat)).toMatchObject({ payload: { seat, cards: expect.any(Array) } });
      expect(viewerEvent(b, 1 - seat)).toEqual({ type: 'cards.dealt', payload: { seat } });
      expect(viewerEvent(b, null)).toEqual({ type: 'cards.dealt', payload: { seat } });
    }
    expect(h.broadcasts.map((b) => b.seq)).toEqual(h.broadcasts.map((_, i) => i + 1));

    const own = h.actor.snapshotFor(h.alice.userId);
    expect(own.you).toEqual({ seat: 0, holeCards: ['Ah', 'Ac'] });
    expect(JSON.stringify(own)).not.toMatch(/"(Kd|Kh)"/);
    expect(JSON.stringify(h.actor.snapshotFor(null))).not.toMatch(/"(Ah|Ac|Kd|Kh)"/);
  });

  it('replays missed events from a sequence number', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();
    const seq = h.actor.seq;
    await h.act(h.alice, { type: 'call' });

    const missed = h.actor.eventsSince(seq)!;
    expect(missed.map((b) => b.seq)).toEqual(h.broadcasts.filter((b) => b.seq > seq).map((b) => b.seq));
    expect(h.actor.eventsSince(h.actor.seq)).toEqual([]);
    expect(h.actor.eventsSince(h.actor.seq + 5)).toBeNull();
  });
});

describe('TableActor: rejecting bad commands', () => {
  it('validates seating', async () => {
    const h = await setup();
    const poor = await createUser(h.db, h.wallet, 'poor', 100n);
    await h.actor.sit(h.alice, 0, 1000n);

    await expect(h.actor.sit(h.bob, 0, 1000n)).rejects.toMatchObject({ code: 'SEAT_TAKEN' });
    await expect(h.actor.sit(h.alice, 1, 1000n)).rejects.toMatchObject({ code: 'ALREADY_SEATED' });
    await expect(h.actor.sit(h.bob, 1, 100n)).rejects.toMatchObject({ code: 'INVALID_BUY_IN' });
    await expect(h.actor.sit(h.bob, 1, 5000n)).rejects.toMatchObject({ code: 'INVALID_BUY_IN' });
    await expect(h.actor.sit(h.bob, 9, 1000n)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(h.actor.sit(poor, 2, 500n)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    await expect(h.actor.stand(h.bob.userId)).rejects.toMatchObject({ code: 'NOT_SEATED' });

    // Failed sits changed nothing.
    expect(h.actor.seatedCount).toBe(1);
    await assertLedgerConsistent(h.db);
  });

  it('validates actions: turn order, stale sequence, wrong hand, illegal moves', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();
    const hand = h.actor.snapshotFor(h.alice.userId).hand!;
    const { handId, actionSeq } = hand;
    const call: WireAction = { type: 'call' };

    await expect(h.actor.act(h.bob.userId, { handId, actionSeq, action: call })).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
    await expect(h.actor.act(h.alice.userId, { handId, actionSeq: actionSeq + 1, action: call })).rejects.toMatchObject({ code: 'STALE_SEQ' });
    await expect(h.actor.act(h.alice.userId, { handId: randomUUID(), actionSeq, action: call })).rejects.toMatchObject({ code: 'NO_ACTIVE_HAND' });
    await expect(h.actor.act(h.alice.userId, { handId, actionSeq, action: { type: 'check' } })).rejects.toMatchObject({ code: 'ILLEGAL_ACTION' });
    await expect(h.actor.act(h.alice.userId, { handId, actionSeq, action: { type: 'raise', to: '25' } })).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(h.actor.act(randomUUID(), { handId, actionSeq, action: call })).rejects.toMatchObject({ code: 'NOT_SEATED' });

    // Replaying an action that already went through is stale, not applied twice.
    await h.actor.act(h.alice.userId, { handId, actionSeq, action: call });
    await expect(h.actor.act(h.alice.userId, { handId, actionSeq, action: call })).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(h.actor.snapshotFor(null).hand!.pot).toBe('40');
  });
});

describe('TableActor: timers and leaving', () => {
  it('folds (or checks) automatically when the action timer expires', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();

    // Alice owes the small blind's difference, so she cannot check: she folds.
    h.clock.advance(20_000);
    await h.actor.whenIdle();

    expect(h.actor.snapshotFor(null).hand).toBeNull();
    expect(h.stacks()).toEqual({ 0: '990', 1: '1010' });
  });

  it('checks on timeout when there is nothing to call', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();
    await h.act(h.alice, { type: 'call' });
    await h.act(h.bob, { type: 'check' });

    h.clock.advance(20_000); // Bob is first to act on the flop and may check.
    await h.actor.whenIdle();
    const hand = h.actor.snapshotFor(null).hand!;
    expect(hand.street).toBe('flop');
    expect(hand.toAct).toBe(0);
  });

  it('a player who stands mid-hand is folded and cashed out when the hand ends', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();

    await h.actor.stand(h.bob.userId); // Not Bob's turn yet: he is marked to fold.
    expect(h.actor.seatOf(h.bob.userId)).toBe(1);
    await h.act(h.alice, { type: 'call' }); // Now Bob's turn: auto-fold.

    expect(h.actor.snapshotFor(null).hand).toBeNull();
    expect(h.actor.seatOf(h.bob.userId)).toBeNull();
    expect(h.stacks()).toEqual({ 0: '1020' });
    expect(await h.wallet.balanceOf({ type: 'user', id: h.bob.userId })).toBe(9_000n + 980n);
    expect(h.clock.pending).toBe(0); // Only one player left: no new hand is scheduled.
    await assertLedgerConsistent(h.db);
  });

  it('unseats and cashes out a player who times out twice in a row, e.g. after closing the browser', async () => {
    const h = await setup();
    await h.seatBoth();

    // Hand 1: alice (small blind) times out and folds. Hand 2: bob does. Hand 3: alice again, her second miss.
    for (let hand = 0; hand < 3; hand++) {
      await h.startHand();
      h.clock.advance(20_000);
      await h.actor.whenIdle();
    }

    expect(h.actor.seatOf(h.alice.userId)).toBeNull();
    expect(h.actor.seatOf(h.bob.userId)).toBe(1);
    expect(await h.wallet.balanceOf({ type: 'user', id: h.alice.userId })).toBe(9_000n + 990n);
    await assertLedgerConsistent(h.db);
  });

  it('forgives a single missed turn once the player acts again', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();
    h.clock.advance(20_000); // alice misses hand 1
    await h.actor.whenIdle();

    await h.startHand(); // hand 2: bob acts first and alice is the big blind
    await h.act(h.bob, { type: 'call' });
    await h.act(h.alice, { type: 'check' }); // acting resets alice's miss count
    h.clock.advance(20_000); // alice is first to act on the flop and misses again: one miss, not two
    await h.actor.whenIdle();
    expect(h.actor.seatOf(h.alice.userId)).toBe(0);
  });

  it('cashes out immediately when standing between hands', async () => {
    const h = await setup();
    await h.actor.sit(h.alice, 0, 700n);
    await h.actor.stand(h.alice.userId);
    expect(await h.wallet.balanceOf({ type: 'user', id: h.alice.userId })).toBe(10_000n);
    await assertLedgerConsistent(h.db);
  });
});

describe('TableActor: crash recovery', () => {
  it('voids an unfinished hand and resumes from the last persisted stacks', async () => {
    const h = await setup();
    await h.seatBoth();
    await h.startHand();
    await h.act(h.alice, { type: 'raise', to: '100' }); // Mid-hand: in-memory stacks differ from persisted ones.
    h.actor.dispose();

    expect(await h.store.voidUnfinishedHands(h.definition.id)).toBe(1);
    const seats = await h.store.loadSeats(h.definition.id);
    expect(seats.map((s) => [s.seat, s.stack])).toEqual([[0, 1000n], [1, 1000n]]);
    expect(await h.store.lastHandNo(h.definition.id)).toBe(1);
    await assertLedgerConsistent(h.db);

    const revived = h.makeActor({ seats, lastHandNo: 1 });
    revived.start();
    h.clock.advance(10);
    await revived.whenIdle();
    expect(revived.snapshotFor(null).hand).toMatchObject({ handNo: 2 });
    revived.dispose();
  });
});
