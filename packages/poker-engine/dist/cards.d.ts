import type { Card, Rank, Suit } from './types.js';
export declare const SUITS: readonly Suit[];
export declare const RANKS: readonly Rank[];
export declare function createDeck(): Card[];
export declare function cardToString(card: Card): string;
/** Parses e.g. "As", "Td", "2c". */
export declare function parseCard(text: string): Card;
/** Parses whitespace-separated cards, e.g. "As Kd 2c". */
export declare function parseCards(text: string): Card[];
