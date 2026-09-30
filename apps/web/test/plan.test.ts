import type { TableEvent } from '@holdem/shared';
import { describe, expect, it } from 'vitest';
import { center } from '../src/game/layout';
import { planTable } from '../src/game/plan';
import { applyTableEvent, viewFromSnapshot } from '../src/net/tableView';
import type { TableView } from '../src/net/tableView';
import { ALICE, event, headsUpHand, snapshot } from './support/messages';

const at = (count: number, viewerUserId = ALICE.userId): TableView =>
  headsUpHand(['x'], 's', 'c')
    .slice(0, count)
    .reduce((v, e) => applyTableEvent(v, e as TableEvent, viewerUserId), viewFromSnapshot(snapshot(), 0));

describe('planTable', () => {
  it('draws nothing before the first snapshot', () => {
    expect(planTable({ view: null, canSit: false })).toMatchObject({ seats: [], cards: [], pot: null });
  });

  it('puts the viewer at the bottom and offers empty seats only to unseated viewers', () => {
    const seated = planTable({ view: at(2), canSit: false });
    const me = seated.seats.find((s) => s.isMe)!;
    expect(me.seat).toBe(0);
    expect(me.position.x).toBeCloseTo(center.x);
    expect(me.position.y).toBeGreaterThan(center.y);
    expect(seated.seats.filter((s) => s.clickable)).toHaveLength(0);

    const spectator = planTable({ view: viewFromSnapshot(snapshot(), 0), canSit: true });
    expect(spectator.seats).toHaveLength(6);
    expect(spectator.seats.every((s) => s.clickable && !s.occupied)).toBe(true);
  });

  it('shows my hole cards face up and everyone else\'s face down', () => {
    const plan = planTable({ view: at(7), canSit: false });
    const byKey = Object.fromEntries(plan.cards.map((c) => [c.key, c.face]));
    expect(byKey).toEqual({
      'h1:seat-0:0': 'Ah',
      'h1:seat-0:1': 'Ac',
      'h1:seat-1:0': null,
      'h1:seat-1:1': null,
    });
  });

  it('reveals opponents at showdown and lays out the board with the pot', () => {
    const plan = planTable({ view: at(13), canSit: false });
    const byKey = Object.fromEntries(plan.cards.map((c) => [c.key, c.face]));
    expect(byKey['h1:seat-1:0']).toBe('Kd');
    expect(byKey['h1:seat-1:1']).toBe('Kh');
    expect([0, 1, 2].map((i) => byKey[`h1:board:${i}`])).toEqual(['2c', '7d', '9s']);
    expect(plan.seats.find((s) => s.seat === 1)?.handName).toBe('Pair');
    expect(plan.pot?.text).toBe('Pot 40');
  });

  it('mucks cards of a folded player and shows who has the button, the bets and the timer', () => {
    const script = headsUpHand(['x'], 's', 'c');
    const folded = applyTableEvent(
      at(8),
      { ...script[8]!, payload: { seat: 0, action: 'fold', amount: '0', betTotal: '10', allIn: false, currentBet: '20', minRaise: '20', actionSeq: 1 } } as TableEvent,
      ALICE.userId,
    );
    expect(planTable({ view: folded, canSit: false }).cards.filter((c) => c.key.includes('seat-0'))).toHaveLength(0);

    const plan = planTable({ view: at(8), canSit: false });
    expect(plan.seats.find((s) => s.seat === 0)).toMatchObject({ isToAct: true, dealerButton: expect.anything(), bet: { text: '10' } });
    expect(plan.seats.find((s) => s.seat === 1)?.dealerButton).toBeNull();
    expect(plan.toAct).toMatchObject({ deadline: 5000, durationMs: 20_000 });
  });

  it('keeps card keys stable between renders so the scene can animate only new cards', () => {
    const keys = (v: TableView) => planTable({ view: v, canSit: false }).cards.map((c) => c.key);
    const before = keys(at(11));
    const after = keys(at(12));
    expect(after.filter((k) => !before.includes(k))).toEqual(['h1:board:0', 'h1:board:1', 'h1:board:2']);
  });

  it('keeps drawing a player who left after the hand, cards included, marked as departed', () => {
    const left = applyTableEvent(at(15), event(16, 'player.left', { seat: 1, userId: 'u-bob' }) as TableEvent, ALICE.userId);
    const plan = planTable({ view: left, canSit: false });
    expect(plan.seats.find((s) => s.seat === 1)).toMatchObject({ occupied: true, departed: true, name: 'bob', clickable: false });
    expect(plan.cards.find((c) => c.key === 'h1:seat-1:0')?.face).toBe('Kd');
  });

  it('announces winnings on the seat', () => {
    const plan = planTable({ view: at(14), canSit: false });
    expect(plan.seats.find((s) => s.seat === 0)?.award).toBe(40n);
    expect(plan.seats.find((s) => s.seat === 1)?.award).toBeNull();
  });
});
