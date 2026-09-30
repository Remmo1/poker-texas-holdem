import type { TableEvent } from '@holdem/shared';
import { describe, expect, it } from 'vitest';
import { applyTableEvent, checkSequence, viewFromSnapshot } from '../src/net/tableView';
import type { TableView } from '../src/net/tableView';
import { ALICE, BOB, event, headsUpHand, snapshot } from './support/messages';

const play = (view: TableView, events: ReturnType<typeof headsUpHand>): TableView =>
  events.reduce((v, e) => applyTableEvent(v, e as TableEvent, ALICE.userId), view);

const empty = () => viewFromSnapshot(snapshot(), 0);
const chips = (view: TableView) => ({
  stacks: Object.values(view.seats).map((s) => s.stack),
  pot: view.hand?.pot ?? 0n,
});

describe('viewFromSnapshot', () => {
  it('parses chips and keeps only the viewer\'s own hole cards', () => {
    const view = viewFromSnapshot(
      snapshot({
        seats: [
          { seat: 0, userId: ALICE.userId, username: 'alice', stack: '980', status: 'active', bet: '20' },
          { seat: 1, userId: BOB.userId, username: 'bob', stack: '990', status: 'active', bet: '10' },
        ],
        hand: {
          handId: 'h1', handNo: 3, deckCommit: 'c', buttonSeat: 1, smallBlindSeat: 1, bigBlindSeat: 0, street: 'flop',
          board: ['2c', '7d', '9s'], currentBet: '0', minRaise: '20', pot: '40', toAct: 0, actionSeq: 4, deadline: 99, legal: null,
        },
        you: { seat: 0, holeCards: ['Ah', 'Ac'] },
      }),
      42,
    );
    expect(view.seq).toBe(42);
    expect(view.seats[0]).toMatchObject({ stack: 980n, bet: 20n, hasCards: true });
    expect(view.hand).toMatchObject({ pot: 40n, board: ['2c', '7d', '9s'], toAct: 0, actionSeq: 4 });
    expect(view.mySeat).toBe(0);
    expect(view.myCards).toEqual(['Ah', 'Ac']);
  });

  it('reports no hand or cards for a spectator', () => {
    const view = viewFromSnapshot(snapshot(), 0);
    expect(view.hand).toBeNull();
    expect(view.mySeat).toBeNull();
    expect(view.myCards).toBeNull();
  });
});

describe('applyTableEvent', () => {
  const deck = ['Ah', 'Kd'];

  it('follows a whole hand and lands on the same numbers as the server', () => {
    const script = headsUpHand(deck, 'salt', 'commit');
    const view = play(empty(), script);

    expect(view.seq).toBe(15);
    expect(view.seats[0]).toMatchObject({ stack: 1020n, bet: 0n });
    expect(view.seats[1]).toMatchObject({ stack: 980n, bet: 0n });
    expect(view.hand).toMatchObject({
      street: 'showdown',
      board: ['2c', '7d', '9s'],
      pot: 0n,
      ended: true,
      toAct: null,
      legal: null,
      awards: [{ seat: 0, amount: 40n }],
      fairness: { deck, salt: 'salt' },
    });
    expect(view.hand?.reveals[1]).toEqual({ cards: ['Kd', 'Kh'], category: 1 });
    expect(view.myCards).toEqual(['Ah', 'Ac']);
  });

  it('tracks pot, bets and the acting seat mid-hand', () => {
    const script = headsUpHand(deck, 'salt', 'commit');
    const afterBlinds = play(empty(), script.slice(0, 5));
    expect(chips(afterBlinds)).toEqual({ stacks: [990n, 980n], pot: 30n });
    expect(afterBlinds.hand).toMatchObject({ currentBet: 20n, minRaise: 20n });

    const myTurn = play(empty(), script.slice(0, 8));
    expect(myTurn.hand).toMatchObject({ toAct: 0, actionSeq: 0, deadline: 5000 });
    expect(myTurn.hand?.legal).toMatchObject({ toCall: 10n, canCall: true, raise: { kind: 'raise', min: 40n, max: 1000n } });

    const afterCall = play(empty(), script.slice(0, 9));
    expect(afterCall.hand).toMatchObject({ toAct: null, legal: null, pot: 40n, actionSeq: 1 });
    expect(afterCall.seats[0]).toMatchObject({ stack: 980n, bet: 20n });
  });

  it('starts each round with cleared bets', () => {
    const view = play(empty(), headsUpHand(deck, 'salt', 'commit').slice(0, 12));
    expect(view.hand).toMatchObject({ street: 'flop', currentBet: 0n, minRaise: 20n, pot: 40n });
    expect(Object.values(view.seats).every((s) => s.bet === 0n)).toBe(true);
  });

  it('keeps the full big blind as the bet to match when the poster was short', () => {
    let view = play(empty(), headsUpHand(deck, 's', 'c').slice(0, 3));
    view = applyTableEvent(view, event(4, 'blind.posted', { seat: 0, blind: 'small', amount: '10', allIn: false }) as TableEvent, ALICE.userId);
    view = applyTableEvent(view, event(5, 'blind.posted', { seat: 1, blind: 'big', amount: '20', allIn: true }) as TableEvent, ALICE.userId);
    expect(view.hand?.currentBet).toBe(20n);
    expect(view.seats[1]?.status).toBe('allin');
  });

  it('returns an uncalled bet to the bettor and takes it out of the pot', () => {
    let view = play(empty(), headsUpHand(deck, 's', 'c').slice(0, 9));
    view = applyTableEvent(view, event(10, 'uncalled.returned', { seat: 0, amount: '15' }) as TableEvent, ALICE.userId);
    expect(view.seats[0]).toMatchObject({ stack: 995n, bet: 5n });
    expect(view.hand?.pot).toBe(25n);
  });

  it('marks a folded seat and drops it from the hand', () => {
    let view = play(empty(), headsUpHand(deck, 's', 'c').slice(0, 8));
    view = applyTableEvent(
      view,
      event(9, 'action.applied', { seat: 0, action: 'fold', amount: '0', betTotal: '10', allIn: false, currentBet: '20', minRaise: '20', actionSeq: 1 }) as TableEvent,
      ALICE.userId,
    );
    expect(view.seats[0]?.status).toBe('folded');
  });

  it('clears the viewer\'s seat and cards when they leave, but not when someone else does', () => {
    const seated = play(empty(), headsUpHand(deck, 's', 'c').slice(0, 7));
    const otherLeft = applyTableEvent(seated, event(8, 'player.left', { seat: 1, userId: BOB.userId }) as TableEvent, ALICE.userId);
    expect(otherLeft.mySeat).toBe(0);
    expect(Object.keys(otherLeft.seats)).toEqual(['0']);

    const iLeft = applyTableEvent(seated, event(8, 'player.left', { seat: 0, userId: ALICE.userId }) as TableEvent, ALICE.userId);
    expect(iLeft).toMatchObject({ mySeat: null, myCards: null });
  });

  it('does not mutate the previous view', () => {
    const before = empty();
    const frozen = JSON.stringify(before, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
    play(before, headsUpHand(deck, 's', 'c'));
    expect(JSON.stringify(before, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).toBe(frozen);
  });
});

describe('lastResult', () => {
  const script = headsUpHand(['x'], 's', 'c');

  it('summarizes the finished hand with each player\'s net result', () => {
    const { lastResult } = play(empty(), script);
    expect(lastResult).toMatchObject({ handId: 'h1', handNo: 1, board: ['2c', '7d', '9s'], fairnessVerified: null });
    expect(lastResult?.players).toEqual([
      { seat: 0, username: 'alice', outcome: 'won', cards: ['Ah', 'Ac'], category: 1, won: 40n, net: 20n },
      { seat: 1, username: 'bob', outcome: 'lost', cards: ['Kd', 'Kh'], category: 1, won: 0n, net: -20n },
    ]);
  });

  it('shows my own cards but not a folded opponent\'s, and survives the next hand starting', () => {
    const folded = script.slice(0, 8);
    let view = play(empty(), folded);
    view = applyTableEvent(
      view,
      event(9, 'action.applied', { seat: 1, action: 'fold', amount: '0', betTotal: '20', allIn: false, currentBet: '20', minRaise: '20', actionSeq: 1 }) as TableEvent,
      ALICE.userId,
    );
    view = applyTableEvent(view, event(10, 'pot.awarded', { potIndex: 0, seat: 0, amount: '30' }) as TableEvent, ALICE.userId);
    view = applyTableEvent(view, event(11, 'hand.ended', { handId: 'h1', deck: ['x'], salt: 's' }) as TableEvent, ALICE.userId);

    expect(view.lastResult?.players.map((p) => [p.username, p.outcome, p.cards])).toEqual([
      ['alice', 'won', ['Ah', 'Ac']],
      ['bob', 'folded', null],
    ]);

    const started = script[2] as unknown as { payload: object };
    const next = applyTableEvent(view, event(12, 'hand.started', { ...started.payload, handId: 'h2', handNo: 2 }) as TableEvent, ALICE.userId);
    expect(next.hand?.handId).toBe('h2');
    expect(next.lastResult?.handId).toBe('h1');
  });
});

describe('players who leave mid-hand', () => {
  const script = headsUpHand(['x'], 's', 'c');

  it('stay on screen with their result until the next hand starts', () => {
    const ended = play(empty(), script);
    const left = applyTableEvent(ended, event(16, 'player.left', { seat: 1, userId: BOB.userId }) as TableEvent, ALICE.userId);
    expect(Object.keys(left.seats)).toEqual(['0']);
    expect(left.departed[1]).toMatchObject({ username: 'bob', stack: 980n });

    const started = script[2] as unknown as { payload: object };
    const next = applyTableEvent(left, event(17, 'hand.started', { ...started.payload, handId: 'h2', handNo: 2 }) as TableEvent, ALICE.userId);
    expect(next.departed).toEqual({});
  });

  it('are not kept when they were never dealt in, and a new player takes over the seat', () => {
    const seatedOnly = play(empty(), script.slice(0, 2));
    const left = applyTableEvent(seatedOnly, event(3, 'player.left', { seat: 1, userId: BOB.userId }) as TableEvent, ALICE.userId);
    expect(left.departed).toEqual({});

    const ended = play(empty(), script);
    const gone = applyTableEvent(ended, event(16, 'player.left', { seat: 1, userId: BOB.userId }) as TableEvent, ALICE.userId);
    const replaced = applyTableEvent(gone, event(17, 'player.seated', { seat: 1, userId: 'u-new', username: 'newbie', stack: '500' }) as TableEvent, ALICE.userId);
    expect(replaced.departed).toEqual({});
    expect(replaced.seats[1]?.username).toBe('newbie');
  });
});

describe('checkSequence', () => {
  it('accepts the next event, ignores repeats and flags gaps', () => {
    const view = viewFromSnapshot(snapshot(), 10);
    expect(checkSequence(view, 11)).toBe('apply');
    expect(checkSequence(view, 10)).toBe('duplicate');
    expect(checkSequence(view, 3)).toBe('duplicate');
    expect(checkSequence(view, 12)).toBe('gap');
  });
});
