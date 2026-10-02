import type { Card } from './types.js';
export declare const HandCategory: {
    readonly HighCard: 0;
    readonly Pair: 1;
    readonly TwoPair: 2;
    readonly ThreeOfAKind: 3;
    readonly Straight: 4;
    readonly Flush: 5;
    readonly FullHouse: 6;
    readonly FourOfAKind: 7;
    readonly StraightFlush: 8;
};
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];
export interface HandValue {
    readonly category: HandCategory;
    /** Higher score wins; equal scores tie. */
    readonly score: number;
}
/** Best 5-card hand from 5 to 7 distinct cards. */
export declare function evaluate(cards: readonly Card[]): HandValue;
