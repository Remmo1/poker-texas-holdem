import type { HandEvent } from './events.js';
import type { HandState, TableRules } from './state.js';
import type { Card, Chips, SeatIndex } from './types.js';
export interface PlayerEntry {
    readonly seat: SeatIndex;
    readonly playerId: string;
    readonly stack: Chips;
}
export interface StartHandInput {
    readonly handId: string;
    readonly rules: TableRules;
    /** Must be one of the participating seats. */
    readonly buttonSeat: SeatIndex;
    readonly players: readonly PlayerEntry[];
    /** Shuffled deck, dealt from index 0. Shuffle with a CSPRNG outside the engine's decision logic. */
    readonly deck: readonly Card[];
}
export type ActionCommand = {
    readonly type: 'fold';
} | {
    readonly type: 'check';
} | {
    readonly type: 'call';
} | {
    readonly type: 'allin';
}
/** `to` is the total bet for the round ("raise to"), not the increment. */
 | {
    readonly type: 'bet';
    readonly to: Chips;
} | {
    readonly type: 'raise';
    readonly to: Chips;
};
export interface EngineResult {
    readonly state: HandState;
    readonly events: readonly HandEvent[];
}
/** Starts a hand: posts blinds, deals hole cards, and requests the first action. */
export declare function startHand(input: StartHandInput): EngineResult;
/** Validates and applies a player's action, then advances the hand as far as it can go. */
export declare function act(state: HandState, seatIndex: SeatIndex, command: ActionCommand): EngineResult;
