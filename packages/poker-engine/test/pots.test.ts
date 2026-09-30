import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computePots } from '../src/pots.js';

describe('computePots', () => {
  it('makes a single pot when everyone matches', () => {
    const { pots, refunds } = computePots([
      { seat: 0, committed: 100n, folded: false },
      { seat: 1, committed: 100n, folded: false },
      { seat: 2, committed: 100n, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 300n, eligible: [0, 1, 2] }]);
    expect(refunds).toEqual([]);
  });

  it('builds side pots and keeps dead money from folded players', () => {
    const { pots, refunds } = computePots([
      { seat: 0, committed: 100n, folded: false },
      { seat: 1, committed: 300n, folded: false },
      { seat: 2, committed: 300n, folded: false },
      { seat: 3, committed: 50n, folded: true },
    ]);
    expect(pots).toEqual([
      { amount: 350n, eligible: [0, 1, 2] },
      { amount: 400n, eligible: [1, 2] },
    ]);
    expect(refunds).toEqual([]);
  });

  it('refunds the part of a bet nobody matched', () => {
    const { pots, refunds } = computePots([
      { seat: 0, committed: 500n, folded: false },
      { seat: 1, committed: 200n, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 400n, eligible: [0, 1] }]);
    expect(refunds).toEqual([{ seat: 0, amount: 300n }]);
  });

  it('conserves chips and always leaves someone eligible', () => {
    const contributions = fc
      .array(fc.record({ committed: fc.bigInt({ min: 1n, max: 1000n }), folded: fc.boolean() }), {
        minLength: 2,
        maxLength: 9,
      })
      .map((rows) => {
        const list = rows.map((r, seat) => ({ ...r, seat }));
        const top = list.reduce((a, b) => (b.committed > a.committed ? b : a));
        return list.map((c) => (c === top ? { ...c, folded: false } : c));
      });

    fc.assert(
      fc.property(contributions, (input) => {
        const { pots, refunds } = computePots(input);
        const paid = [...pots.map((p) => p.amount), ...refunds.map((r) => r.amount)].reduce((a, b) => a + b, 0n);
        expect(paid).toBe(input.reduce((sum, c) => sum + c.committed, 0n));
        for (const pot of pots) expect(pot.eligible.length).toBeGreaterThan(0);
      }),
    );
  });
});
