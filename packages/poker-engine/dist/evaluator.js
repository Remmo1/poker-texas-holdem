import { SUITS } from './cards.js';
export const HandCategory = {
    HighCard: 0,
    Pair: 1,
    TwoPair: 2,
    ThreeOfAKind: 3,
    Straight: 4,
    Flush: 5,
    FullHouse: 6,
    FourOfAKind: 7,
    StraightFlush: 8,
};
const RANK_BASE = 15;
function value(category, ranks) {
    let score = category;
    for (let i = 0; i < 5; i++)
        score = score * RANK_BASE + (ranks[i] ?? 0);
    return { category, score };
}
/** Highest card of a straight in the rank bitmask (bit r = rank r), or 0. Ace plays low as 1. */
function straightHigh(mask) {
    const withLowAce = mask & (1 << 14) ? mask | (1 << 1) : mask;
    for (let high = 14; high >= 5; high--) {
        const window = 0b11111 << (high - 4);
        if ((withLowAce & window) === window)
            return high;
    }
    return 0;
}
function topRanks(mask, count) {
    const ranks = [];
    for (let r = 14; r >= 2 && ranks.length < count; r--) {
        if (mask & (1 << r))
            ranks.push(r);
    }
    return ranks;
}
function kickers(distinctDesc, exclude, count) {
    return distinctDesc.filter((r) => !exclude.includes(r)).slice(0, count);
}
/** Best 5-card hand from 5 to 7 distinct cards. */
export function evaluate(cards) {
    if (cards.length < 5 || cards.length > 7) {
        throw new RangeError(`evaluate expects 5-7 cards, got ${cards.length}`);
    }
    const rankCount = new Array(15).fill(0);
    const suitCount = { c: 0, d: 0, h: 0, s: 0 };
    const suitMask = { c: 0, d: 0, h: 0, s: 0 };
    let rankMask = 0;
    for (const { rank, suit } of cards) {
        rankCount[rank]++;
        suitCount[suit]++;
        suitMask[suit] |= 1 << rank;
        rankMask |= 1 << rank;
    }
    const flushSuit = SUITS.find((s) => suitCount[s] >= 5);
    if (flushSuit) {
        const high = straightHigh(suitMask[flushSuit]);
        if (high)
            return value(HandCategory.StraightFlush, [high]);
    }
    const quads = [];
    const trips = [];
    const pairs = [];
    const distinct = [];
    for (let r = 14; r >= 2; r--) {
        const n = rankCount[r];
        if (n === 0)
            continue;
        distinct.push(r);
        if (n === 4)
            quads.push(r);
        else if (n === 3)
            trips.push(r);
        else if (n === 2)
            pairs.push(r);
    }
    if (quads.length > 0) {
        return value(HandCategory.FourOfAKind, [quads[0], ...kickers(distinct, [quads[0]], 1)]);
    }
    if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
        const pair = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
        return value(HandCategory.FullHouse, [trips[0], pair]);
    }
    if (flushSuit)
        return value(HandCategory.Flush, topRanks(suitMask[flushSuit], 5));
    const straight = straightHigh(rankMask);
    if (straight)
        return value(HandCategory.Straight, [straight]);
    if (trips.length > 0) {
        return value(HandCategory.ThreeOfAKind, [trips[0], ...kickers(distinct, [trips[0]], 2)]);
    }
    if (pairs.length >= 2) {
        const top = [pairs[0], pairs[1]];
        return value(HandCategory.TwoPair, [...top, ...kickers(distinct, top, 1)]);
    }
    if (pairs.length === 1) {
        return value(HandCategory.Pair, [pairs[0], ...kickers(distinct, [pairs[0]], 3)]);
    }
    return value(HandCategory.HighCard, distinct.slice(0, 5));
}
//# sourceMappingURL=evaluator.js.map