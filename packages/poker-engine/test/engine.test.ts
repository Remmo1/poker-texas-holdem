import { describe, expect, it } from 'vitest';
import { act, startHand } from '../src/engine.js';
import type { HandEvent } from '../src/events.js';
import { HandCategory } from '../src/evaluator.js';
import { replay } from '../src/reducer.js';
import { seededRng, shuffledDeck } from '../src/rng.js';
import { getLegalActions } from '../src/rules.js';
import { errorCode, play, stacks, stackedDeck } from './helpers.js';

const rules = { smallBlind: 50n, bigBlind: 100n };
const player = (seat: number, stack: bigint) => ({ seat, playerId: `p${seat}`, stack });
const HEADS_UP_DECK = 'Ah Kd Ac Kh 2c 7d 9s Jh 3d'; // seat 0: AA, seat 1: KK

describe('startHand', () => {
  it('heads-up: button is small blind and acts first preflop', () => {
    const { state } = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 1000n)],
      deck: stackedDeck(HEADS_UP_DECK),
    });

    expect([state.smallBlindSeat, state.bigBlindSeat, state.toAct]).toEqual([0, 1, 0]);
    expect(getLegalActions(state)).toEqual({
      seat: 0,
      toCall: 50n,
      canCheck: false,
      canCall: true,
      raise: { kind: 'raise', min: 200n, max: 1000n },
    });
    expect(state.seats.map((s) => s.holeCards?.length)).toEqual([2, 2]);
  });

  it('three-handed: blinds follow the button and UTG acts first', () => {
    const { state } = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 1000n), player(2, 1000n)],
      deck: shuffledDeck(seededRng(1)),
    });
    expect([state.smallBlindSeat, state.bigBlindSeat, state.toAct]).toEqual([1, 2, 0]);
  });

  it('rejects invalid setups', () => {
    const base = { handId: 'h', rules, buttonSeat: 0, deck: shuffledDeck(seededRng(1)) };
    expect(errorCode(() => startHand({ ...base, players: [player(0, 100n)] }))).toBe('INVALID_SETUP');
    expect(errorCode(() => startHand({ ...base, players: [player(0, 100n), player(1, 0n)] }))).toBe('INVALID_SETUP');
    expect(errorCode(() => startHand({ ...base, buttonSeat: 5, players: [player(0, 100n), player(1, 100n)] }))).toBe(
      'INVALID_SETUP',
    );
  });
});

describe('hand flow', () => {
  const heads = () =>
    startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 1000n)],
      deck: stackedDeck(HEADS_UP_DECK),
    }).state;

  it('check-down to showdown pays the best hand', () => {
    const { state, events } = play(heads(), [
      [0, { type: 'call' }],
      [1, { type: 'check' }],
      // Postflop the big blind acts first.
      ...(['flop', 'turn', 'river'] as const).flatMap(() => [
        [1, { type: 'check' }] as const,
        [0, { type: 'check' }] as const,
      ]),
    ]);

    expect(state.status).toBe('complete');
    expect(state.board).toHaveLength(5);
    expect(stacks(state)).toEqual({ 0: 1100n, 1: 900n });
    const showdown = events.find((e) => e.type === 'ShowdownRevealed');
    expect(showdown?.reveals.find((r) => r.seat === 0)?.category).toBe(HandCategory.Pair);
  });

  it('folding ends the hand without a showdown', () => {
    const { state, events } = play(heads(), [[0, { type: 'fold' }]]);
    expect(state.status).toBe('complete');
    expect(stacks(state)).toEqual({ 0: 950n, 1: 1050n });
    expect(events.some((e) => e.type === 'ShowdownRevealed')).toBe(false);
  });

  it('three-handed: everyone folding to the big blind awards the blinds', () => {
    const start = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 1000n), player(2, 1000n)],
      deck: shuffledDeck(seededRng(1)),
    }).state;
    const { state } = play(start, [
      [0, { type: 'fold' }],
      [1, { type: 'fold' }],
    ]);
    expect(stacks(state)).toEqual({ 0: 1000n, 1: 950n, 2: 1050n });
  });

  it('returns the uncalled part of an all-in bet', () => {
    const start = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 200n)],
      deck: stackedDeck(HEADS_UP_DECK),
    }).state;
    const { state, events } = play(start, [
      [0, { type: 'raise', to: 1000n }],
      [1, { type: 'call' }],
    ]);
    expect(events).toContainEqual({ type: 'UncalledBetReturned', seat: 0, amount: 800n });
    expect(stacks(state)).toEqual({ 0: 1200n, 1: 0n });
  });

  it('splits side pots among all-in players of different sizes', () => {
    const start = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 100n), player(1, 300n), player(2, 500n)],
      // seat 0: AA, seat 1: KK, seat 2: 72o
      deck: stackedDeck('Ks 7c As Kd 2d Ad 3h 8c 9d Jc 4s'),
    }).state;
    const { state } = play(start, [
      [0, { type: 'allin' }],
      [1, { type: 'allin' }],
      [2, { type: 'call' }],
    ]);
    expect(state.pots).toEqual([
      { amount: 300n, eligible: [0, 1, 2] },
      { amount: 400n, eligible: [1, 2] },
    ]);
    expect(stacks(state)).toEqual({ 0: 300n, 1: 400n, 2: 200n });
  });

  it('gives the odd chip of a split pot to the first winner left of the button', () => {
    const start = startHand({
      handId: 'h1',
      rules: { smallBlind: 1n, bigBlind: 2n },
      buttonSeat: 0,
      players: [player(0, 100n), player(1, 100n), player(2, 100n)],
      // Royal flush on the board: seats 0 and 2 tie.
      deck: stackedDeck('4c 2d 2c 5d 3c 3d Ah Kh Qh Jh Th'),
    }).state;
    const street = [
      [2, { type: 'check' }],
      [0, { type: 'check' }],
    ] as const;
    const { state } = play(start, [
      [0, { type: 'call' }],
      [1, { type: 'fold' }],
      [2, { type: 'check' }],
      ...street,
      ...street,
      ...street,
    ]);
    expect(stacks(state)).toEqual({ 0: 100n, 1: 99n, 2: 101n });
  });
});

describe('betting rules', () => {
  const heads = () =>
    startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 1000n)],
      deck: stackedDeck(HEADS_UP_DECK),
    }).state;

  it('enforces turn order and legality', () => {
    const state = heads();
    expect(errorCode(() => act(state, 1, { type: 'check' }))).toBe('NOT_YOUR_TURN');
    expect(errorCode(() => act(state, 0, { type: 'check' }))).toBe('ILLEGAL_ACTION');
    expect(errorCode(() => act(state, 0, { type: 'bet', to: 300n }))).toBe('ILLEGAL_ACTION');
  });

  it('enforces the minimum raise and raises it after a raise', () => {
    const state = heads();
    expect(errorCode(() => act(state, 0, { type: 'raise', to: 150n }))).toBe('INVALID_AMOUNT');
    expect(errorCode(() => act(state, 0, { type: 'raise', to: 1001n }))).toBe('INVALID_AMOUNT');

    const { state: raised } = act(state, 0, { type: 'raise', to: 300n });
    expect(getLegalActions(raised)?.raise).toEqual({ kind: 'raise', min: 500n, max: 1000n });
  });

  it('uses "bet" postflop when there is nothing to call', () => {
    const { state } = play(heads(), [
      [0, { type: 'call' }],
      [1, { type: 'check' }],
    ]);
    expect(getLegalActions(state)?.raise).toEqual({ kind: 'bet', min: 100n, max: 900n });
    expect(errorCode(() => act(state, 1, { type: 'raise', to: 200n }))).toBe('ILLEGAL_ACTION');
  });

  it('rejects actions after the hand is over', () => {
    const { state } = play(heads(), [[0, { type: 'fold' }]]);
    expect(errorCode(() => act(state, 1, { type: 'check' }))).toBe('HAND_COMPLETE');
  });

  it('does not reopen betting after a short all-in raise', () => {
    const start = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 170n), player(2, 1000n)],
      deck: shuffledDeck(seededRng(7)),
    }).state;

    // Seat 0 limps; seat 1 (small blind) shoves 170, a raise of only 70 (< 100).
    const { state } = play(start, [
      [0, { type: 'call' }],
      [1, { type: 'allin' }],
    ]);
    // The big blind never acted, so it may still raise.
    expect(getLegalActions(state)?.raise).toEqual({ kind: 'raise', min: 270n, max: 1000n });

    const { state: afterBb } = act(state, 2, { type: 'call' });
    // Seat 0 already acted and only faces a short raise: call or fold only.
    expect(afterBb.toAct).toBe(0);
    expect(getLegalActions(afterBb)).toMatchObject({ toCall: 70n, raise: null });
    expect(errorCode(() => act(afterBb, 0, { type: 'raise', to: 500n }))).toBe('ILLEGAL_ACTION');
    expect(errorCode(() => act(afterBb, 0, { type: 'allin' }))).toBe('ILLEGAL_ACTION');
  });

  it('runs out the board when everyone is all-in', () => {
    const start = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 500n), player(1, 500n)],
      deck: stackedDeck(HEADS_UP_DECK),
    }).state;
    const { state, events } = play(start, [
      [0, { type: 'allin' }],
      [1, { type: 'call' }],
    ]);
    const streets = events.filter((e) => e.type === 'StreetAdvanced').map((e) => e.street);
    expect(streets).toEqual(['flop', 'turn', 'river']);
    expect(state.status).toBe('complete');
  });
});

describe('event sourcing', () => {
  it('replaying events rebuilds the exact state', () => {
    const started = startHand({
      handId: 'h1',
      rules,
      buttonSeat: 0,
      players: [player(0, 1000n), player(1, 1000n)],
      deck: stackedDeck(HEADS_UP_DECK),
    });
    const { state, events } = play(started.state, [
      [0, { type: 'raise', to: 300n }],
      [1, { type: 'call' }],
      [1, { type: 'bet', to: 200n }],
      [0, { type: 'fold' }],
    ]);
    const all: HandEvent[] = [...started.events, ...events];
    expect(replay(all)).toEqual(state);
  });
});
