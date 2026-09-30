import { createDeck, cardToString, parseCards } from '../src/cards.js';
import { act } from '../src/engine.js';
import type { ActionCommand } from '../src/engine.js';
import type { HandEvent } from '../src/events.js';
import type { HandState } from '../src/state.js';
import type { Card, SeatIndex } from '../src/types.js';

/** A full deck whose first cards are `top`, so tests control exactly what is dealt. */
export function stackedDeck(top: string): Card[] {
  const head = parseCards(top);
  const used = new Set(head.map(cardToString));
  return [...head, ...createDeck().filter((c) => !used.has(cardToString(c)))];
}

export type Step = readonly [SeatIndex, ActionCommand];

export function play(start: HandState, steps: readonly Step[]): { state: HandState; events: HandEvent[] } {
  let state = start;
  const events: HandEvent[] = [];
  for (const [seat, command] of steps) {
    const result = act(state, seat, command);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

export function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

export const stacks = (state: HandState): Record<number, bigint> =>
  Object.fromEntries(state.seats.map((s) => [s.seat, s.stack]));
