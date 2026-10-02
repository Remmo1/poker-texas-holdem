import type { HandState, SeatState } from './state.js';
import type { Chips, SeatIndex } from './types.js';
export interface LegalActions {
    readonly seat: SeatIndex;
    /** Chips needed to call, capped at the stack. */
    readonly toCall: Chips;
    readonly canCheck: boolean;
    readonly canCall: boolean;
    /** Raise-to totals for the round; null when raising is not allowed. Folding is always allowed. */
    readonly raise: {
        readonly kind: 'bet' | 'raise';
        readonly min: Chips;
        readonly max: Chips;
    } | null;
}
/** A seat that already acted may raise again only if the bet grew by at least a full raise since. */
export declare function canRaiseAgain(state: HandState, seat: SeatState): boolean;
/** Next seat clockwise after `from` that must still act this round, or null if the round is over. */
export declare function nextSeatToAct(state: HandState, from: SeatIndex): SeatIndex | null;
export declare function getLegalActions(state: HandState): LegalActions | null;
