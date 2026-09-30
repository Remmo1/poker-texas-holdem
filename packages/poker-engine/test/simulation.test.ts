import { describe, expect, it } from 'vitest';
import { act, startHand } from '../src/engine.js';
import type { ActionCommand } from '../src/engine.js';
import type { HandEvent } from '../src/events.js';
import { replay } from '../src/reducer.js';
import { seededRng, shuffle, shuffledDeck } from '../src/rng.js';
import type { Rng } from '../src/rng.js';
import { getLegalActions } from '../src/rules.js';
import type { HandState } from '../src/state.js';

function randomAction(state: HandState, rng: Rng): ActionCommand {
  const legal = getLegalActions(state)!;
  const roll = rng.nextInt(100);
  if (roll < 15 && !legal.canCheck) return { type: 'fold' };
  if (roll < 22 && legal.raise) return { type: 'allin' };
  if (roll < 50 && legal.raise) {
    const span = Number(legal.raise.max - legal.raise.min);
    return { type: legal.raise.kind, to: legal.raise.min + BigInt(rng.nextInt(span + 1)) };
  }
  return legal.canCheck ? { type: 'check' } : { type: 'call' };
}

const totalChips = (state: HandState): bigint =>
  state.seats.reduce((sum, s) => sum + s.stack + (state.status === 'complete' ? 0n : s.totalCommitted), 0n);

describe('random play simulation', () => {
  it('conserves chips, terminates, and replays exactly over 3000 hands', () => {
    const rng = seededRng(20240229);

    for (let i = 0; i < 3000; i++) {
      const playerCount = 2 + rng.nextInt(8);
      const seats = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rng).slice(0, playerCount);
      const players = seats.map((seat) => ({ seat, playerId: `p${seat}`, stack: BigInt(1 + rng.nextInt(2000)) }));
      const initial = players.reduce((sum, p) => sum + p.stack, 0n);

      const started = startHand({
        handId: `h${i}`,
        rules: { smallBlind: 10n, bigBlind: 20n },
        buttonSeat: seats[rng.nextInt(seats.length)]!,
        players,
        deck: shuffledDeck(rng),
      });
      let state = started.state;
      const events: HandEvent[] = [...started.events];

      for (let steps = 0; state.status === 'in_progress'; steps++) {
        expect(steps).toBeLessThan(500);
        expect(totalChips(state)).toBe(initial);
        expect(getLegalActions(state)).not.toBeNull();
        const result = act(state, state.toAct!, randomAction(state, rng));
        state = result.state;
        events.push(...result.events);
      }

      expect(totalChips(state)).toBe(initial);
      expect(state.seats.every((s) => s.stack >= 0n)).toBe(true);
      expect(replay(events)).toEqual(state);
    }
  }, 120_000);
});
