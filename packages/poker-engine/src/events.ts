import type { HandCategory } from './evaluator.js';
import type { Pot, Street, TableRules } from './state.js';
import type { Card, Chips, SeatIndex } from './types.js';

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** Contains the full deck: must never be sent to clients. */
export interface HandStarted {
  readonly type: 'HandStarted';
  readonly handId: string;
  readonly rules: TableRules;
  readonly buttonSeat: SeatIndex;
  readonly smallBlindSeat: SeatIndex;
  readonly bigBlindSeat: SeatIndex;
  readonly players: readonly { seat: SeatIndex; playerId: string; stack: Chips }[];
  readonly deck: readonly Card[];
}

export interface BlindPosted {
  readonly type: 'BlindPosted';
  readonly seat: SeatIndex;
  readonly blind: 'small' | 'big';
  readonly amount: Chips;
  readonly allIn: boolean;
  readonly currentBet: Chips;
}

/** Private to `seat`. */
export interface HoleCardsDealt {
  readonly type: 'HoleCardsDealt';
  readonly seat: SeatIndex;
  readonly cards: readonly [Card, Card];
}

export interface ActionRequested {
  readonly type: 'ActionRequested';
  readonly seat: SeatIndex;
}

export interface ActionApplied {
  readonly type: 'ActionApplied';
  readonly seat: SeatIndex;
  readonly action: ActionKind;
  /** Chips moved from the stack to the pot by this action. */
  readonly amount: Chips;
  /** The seat's total bet for the round after this action. */
  readonly betTotal: Chips;
  readonly allIn: boolean;
  readonly currentBet: Chips;
  readonly minRaise: Chips;
  readonly actionSeq: number;
}

export interface StreetAdvanced {
  readonly type: 'StreetAdvanced';
  readonly street: Exclude<Street, 'preflop' | 'showdown'>;
  readonly cards: readonly Card[];
}

export interface UncalledBetReturned {
  readonly type: 'UncalledBetReturned';
  readonly seat: SeatIndex;
  readonly amount: Chips;
}

export interface ShowdownRevealed {
  readonly type: 'ShowdownRevealed';
  readonly reveals: readonly {
    seat: SeatIndex;
    cards: readonly [Card, Card];
    category: HandCategory;
    score: number;
  }[];
}

export interface PotsFormed {
  readonly type: 'PotsFormed';
  readonly pots: readonly Pot[];
}

export interface PotAwarded {
  readonly type: 'PotAwarded';
  readonly potIndex: number;
  readonly seat: SeatIndex;
  readonly amount: Chips;
}

export interface HandEnded {
  readonly type: 'HandEnded';
}

export type HandEvent =
  | HandStarted
  | BlindPosted
  | HoleCardsDealt
  | ActionRequested
  | ActionApplied
  | StreetAdvanced
  | UncalledBetReturned
  | ShowdownRevealed
  | PotsFormed
  | PotAwarded
  | HandEnded;
