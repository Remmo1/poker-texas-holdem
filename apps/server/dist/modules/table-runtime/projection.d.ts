import type { Card, HandEvent, HandState, LegalActions } from '@holdem/poker-engine';
import type { TableEventBody, WireLegalActions } from '@holdem/shared';
export interface ProjectionContext {
    /** Hand state after `event` has been applied. */
    readonly state: HandState;
    readonly handNo: number;
    readonly deckCommit: string;
    readonly userIdBySeat: ReadonlyMap<number, string>;
    /** Set only for ActionRequested. */
    readonly deadline: number | null;
    /** Set only for HandEnded: the deck and salt are revealed once the hand is over. */
    readonly reveal: {
        readonly deck: readonly Card[];
        readonly salt: string;
    } | null;
}
/** What every viewer sees, plus an optional richer version for one seat's owner. */
export interface Projected {
    readonly public: TableEventBody;
    readonly forSeat?: {
        readonly seat: number;
        readonly event: TableEventBody;
    };
}
export declare function toWireLegal(legal: LegalActions): WireLegalActions;
/**
 * The only place engine events become client-visible messages. Anything not mapped here, notably the
 * deck in HandStarted and other players' hole cards, never leaves the server.
 */
export declare function projectHandEvent(event: HandEvent, ctx: ProjectionContext): Projected | null;
