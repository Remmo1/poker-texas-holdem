import { minChips } from './chips.js';
import { activeSeats, getSeat, seatsClockwiseAfter } from './state.js';
import type { HandState, SeatState } from './state.js';
import type { Chips, SeatIndex } from './types.js';

export interface LegalActions {
  readonly seat: SeatIndex;
  /** Chips needed to call, capped at the stack. */
  readonly toCall: Chips;
  readonly canCheck: boolean;
  readonly canCall: boolean;
  /** Raise-to totals for the round; null when raising is not allowed. Folding is always allowed. */
  readonly raise: { readonly kind: 'bet' | 'raise'; readonly min: Chips; readonly max: Chips } | null;
}

/** A seat that already acted may raise again only if the bet grew by at least a full raise since. */
export function canRaiseAgain(state: HandState, seat: SeatState): boolean {
  return seat.levelAtLastAction === null || state.currentBet - seat.levelAtLastAction >= state.minRaise;
}

function needsToAct(state: HandState, seat: SeatState, activeCount: number): boolean {
  if (seat.status !== 'active') return false;
  const owes = seat.bet < state.currentBet;
  // A lone player with chips has nobody to bet against.
  if (activeCount === 1 && !owes) return false;
  return owes || seat.levelAtLastAction === null;
}

/** Next seat clockwise after `from` that must still act this round, or null if the round is over. */
export function nextSeatToAct(state: HandState, from: SeatIndex): SeatIndex | null {
  const activeCount = activeSeats(state).length;
  return seatsClockwiseAfter(state, from).find((s) => needsToAct(state, s, activeCount))?.seat ?? null;
}

export function getLegalActions(state: HandState): LegalActions | null {
  if (state.status === 'complete' || state.toAct === null) return null;

  const seat = getSeat(state, state.toAct);
  const owed = state.currentBet - seat.bet;
  const max = seat.bet + seat.stack;
  const hasOpponentToRespond = state.seats.some((s) => s.seat !== seat.seat && s.status === 'active');
  const canRaise = seat.stack > owed && canRaiseAgain(state, seat) && hasOpponentToRespond;

  return {
    seat: seat.seat,
    toCall: minChips(owed, seat.stack),
    canCheck: owed === 0n,
    canCall: owed > 0n,
    raise: canRaise
      ? {
          kind: state.currentBet === 0n ? 'bet' : 'raise',
          min: minChips(state.currentBet + state.minRaise, max),
          max,
        }
      : null,
  };
}
