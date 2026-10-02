export type Suit = 'c' | 'd' | 'h' | 's';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card {
    readonly rank: Rank;
    readonly suit: Suit;
}
/** Chip amounts are integers; bigint avoids float drift and overflow. */
export type Chips = bigint;
export type SeatIndex = number;
