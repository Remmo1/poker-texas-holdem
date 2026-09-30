import type { Card, Rank, Suit } from './types.js';

export const SUITS: readonly Suit[] = ['c', 'd', 'h', 's'];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_CHARS = '23456789TJQKA';

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function cardToString(card: Card): string {
  return `${RANK_CHARS[card.rank - 2]}${card.suit}`;
}

/** Parses e.g. "As", "Td", "2c". */
export function parseCard(text: string): Card {
  const rankIndex = RANK_CHARS.indexOf(text[0]?.toUpperCase() ?? '');
  const suit = text[1]?.toLowerCase() as Suit | undefined;
  if (text.length !== 2 || rankIndex < 0 || !suit || !SUITS.includes(suit)) {
    throw new RangeError(`Invalid card: "${text}"`);
  }
  return { rank: (rankIndex + 2) as Rank, suit };
}

/** Parses whitespace-separated cards, e.g. "As Kd 2c". */
export function parseCards(text: string): Card[] {
  return text
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map(parseCard);
}
