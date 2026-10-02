import type { Card } from '@holdem/poker-engine';
export interface DeckDraw {
    readonly deck: readonly Card[];
    readonly salt: string;
}
export type DeckSource = () => DeckDraw;
export declare const DECK_SOURCE: unique symbol;
export declare const secureDeckSource: DeckSource;
/** Commitment published before the deal; the deck and salt are revealed after the hand so players can verify it. */
export declare function commitDeck(deck: readonly Card[], salt: string): string;
