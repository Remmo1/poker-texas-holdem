import { sumChips } from './chips.js';
import { EngineError } from './errors.js';
import type { Card, Chips, SeatIndex } from './types.js';

export interface TableRules {
  readonly smallBlind: Chips;
  readonly bigBlind: Chips;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type SeatStatus = 'active' | 'folded' | 'allin';

export interface SeatState {
  readonly seat: SeatIndex;
  readonly playerId: string;
  readonly stack: Chips;
  readonly status: SeatStatus;
  readonly holeCards: readonly [Card, Card] | null;
  /** Chips committed in the current betting round. */
  readonly bet: Chips;
  /** Chips committed in the whole hand. */
  readonly totalCommitted: Chips;
  /** Current bet level when this seat last acted this round; null if it has not acted yet. */
  readonly levelAtLastAction: Chips | null;
}

export interface Pot {
  readonly amount: Chips;
  readonly eligible: readonly SeatIndex[];
}

/** Server-only state: contains the undealt deck and all hole cards. */
export interface HandState {
  readonly handId: string;
  readonly rules: TableRules;
  readonly buttonSeat: SeatIndex;
  readonly smallBlindSeat: SeatIndex;
  readonly bigBlindSeat: SeatIndex;
  readonly street: Street;
  readonly status: 'in_progress' | 'complete';
  /** Seats dealt into this hand, ascending by seat index. */
  readonly seats: readonly SeatState[];
  readonly board: readonly Card[];
  readonly deck: readonly Card[];
  readonly currentBet: Chips;
  /** Size of the last full raise; the minimum increment for the next raise. */
  readonly minRaise: Chips;
  readonly toAct: SeatIndex | null;
  readonly pots: readonly Pot[];
  /** Increments on every applied action; lets callers reject stale commands. */
  readonly actionSeq: number;
}

export function getSeat(state: HandState, seat: SeatIndex): SeatState {
  const found = state.seats.find((s) => s.seat === seat);
  if (!found) throw new EngineError('ILLEGAL_ACTION', `Seat ${seat} is not in this hand`);
  return found;
}

export const liveSeats = (state: HandState): SeatState[] => state.seats.filter((s) => s.status !== 'folded');

export const activeSeats = (state: HandState): SeatState[] => state.seats.filter((s) => s.status === 'active');

export const totalPot = (state: HandState): Chips => sumChips(state.seats.map((s) => s.totalCommitted));

/** All seats in the hand in clockwise order, starting just after `from` and ending with `from`. */
export function seatsClockwiseAfter(state: HandState, from: SeatIndex): SeatState[] {
  return [...state.seats.filter((s) => s.seat > from), ...state.seats.filter((s) => s.seat <= from)];
}
