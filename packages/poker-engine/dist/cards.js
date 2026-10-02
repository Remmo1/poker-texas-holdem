export const SUITS = ['c', 'd', 'h', 's'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_CHARS = '23456789TJQKA';
export function createDeck() {
    return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}
export function cardToString(card) {
    return `${RANK_CHARS[card.rank - 2]}${card.suit}`;
}
/** Parses e.g. "As", "Td", "2c". */
export function parseCard(text) {
    const rankIndex = RANK_CHARS.indexOf(text[0]?.toUpperCase() ?? '');
    const suit = text[1]?.toLowerCase();
    if (text.length !== 2 || rankIndex < 0 || !suit || !SUITS.includes(suit)) {
        throw new RangeError(`Invalid card: "${text}"`);
    }
    return { rank: (rankIndex + 2), suit };
}
/** Parses whitespace-separated cards, e.g. "As Kd 2c". */
export function parseCards(text) {
    return text
        .split(/\s+/)
        .filter((part) => part.length > 0)
        .map(parseCard);
}
//# sourceMappingURL=cards.js.map