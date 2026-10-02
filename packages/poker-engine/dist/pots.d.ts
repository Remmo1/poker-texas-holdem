import type { Pot } from './state.js';
import type { Chips, SeatIndex } from './types.js';
export interface Contribution {
    readonly seat: SeatIndex;
    readonly committed: Chips;
    readonly folded: boolean;
}
export interface Refund {
    readonly seat: SeatIndex;
    readonly amount: Chips;
}
/**
 * Splits contributions into a main pot and side pots by commitment level.
 * Chips that no other player matched are returned as refunds instead of forming a pot.
 */
export declare function computePots(contributions: readonly Contribution[]): {
    pots: Pot[];
    refunds: Refund[];
};
