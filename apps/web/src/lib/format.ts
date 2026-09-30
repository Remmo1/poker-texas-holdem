export const HAND_CATEGORY_NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const;

export const formatChips = (value: bigint): string => value.toLocaleString('en-US');

export type SuitLetter = 'c' | 'd' | 'h' | 's';

export const SUIT_SYMBOLS: Record<SuitLetter, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

export interface CardFace {
  /** "A", "K", "10", "7"… */
  readonly rank: string;
  readonly suit: SuitLetter;
  readonly red: boolean;
}

/** Turns the wire form ("Td", "As") into what a card is drawn with. */
export function parseCardFace(card: string): CardFace {
  const rankChar = card[0] ?? '?';
  const suit = (card[1] ?? 'c') as SuitLetter;
  return { rank: rankChar === 'T' ? '10' : rankChar, suit, red: suit === 'h' || suit === 'd' };
}
