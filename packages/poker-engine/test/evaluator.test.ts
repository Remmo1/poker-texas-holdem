import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDeck, parseCards } from '../src/cards.js';
import { evaluate, HandCategory } from '../src/evaluator.js';
import type { Card } from '../src/types.js';

const score = (hand: string) => evaluate(parseCards(hand)).score;
const category = (hand: string) => evaluate(parseCards(hand)).category;

describe('evaluate: categories', () => {
  const cases: [string, string, number][] = [
    ['royal flush', 'As Ks Qs Js Ts 2c 3d', HandCategory.StraightFlush],
    ['steel wheel', 'Ah 2h 3h 4h 5h Kd Qc', HandCategory.StraightFlush],
    ['quads', '9h 9d 9c 9s Kd 2c 3d', HandCategory.FourOfAKind],
    ['full house', 'Kh Kd Kc 2s 2d 7c 9h', HandCategory.FullHouse],
    ['flush', 'Ah 9h 7h 5h 2h Kd Qc', HandCategory.Flush],
    ['straight', '5c 6d 7h 8s 9c Kd Ac', HandCategory.Straight],
    ['wheel', 'Ac 2d 3h 4s 5c Kd Qc', HandCategory.Straight],
    ['broadway', 'Tc Jd Qh Ks Ac 2d 3c', HandCategory.Straight],
    ['trips', '8c 8d 8h Ks 2d 4c 9h', HandCategory.ThreeOfAKind],
    ['two pair', 'Jc Jd 4h 4s 2d 9c Kh', HandCategory.TwoPair],
    ['pair', 'Tc Td 4h 6s 2d 9c Kh', HandCategory.Pair],
    ['high card', 'Ac Kd 9h 7s 4d 3c 2h', HandCategory.HighCard],
    ['flush beats a separate straight', 'Ah Kh Qh Jh 9h Tc 2d', HandCategory.Flush],
    ['near straight flush is only a flush', '5h 6h 7h 8h Kh 9c 2c', HandCategory.Flush],
  ];
  it.each(cases)('%s', (_name, hand, expected) => {
    expect(category(hand)).toBe(expected);
  });
});

describe('evaluate: ordering', () => {
  it('ranks every category above the previous one', () => {
    const ladder = [
      'Ac Kd 9h 7s 4d 3c 2h',
      'Tc Td 4h 6s 2d 9c Kh',
      'Jc Jd 4h 4s 2d 9c Kh',
      '8c 8d 8h Ks 2d 4c 9h',
      '5c 6d 7h 8s 9c Kd Ac',
      'Ah 9h 7h 5h 2h Kd Qc',
      'Kh Kd Kc 2s 2d 7c 9h',
      '9h 9d 9c 9s Kd 2c 3d',
      'As Ks Qs Js Ts 2c 3d',
    ].map(score);
    expect([...ladder].sort((a, b) => a - b)).toEqual(ladder);
  });

  it('wheel is the lowest straight', () => {
    expect(score('Ac 2d 3h 4s 5c 9d Kc')).toBeLessThan(score('2c 3d 4h 5s 6c 9d Kc'));
  });

  it('breaks ties on kickers', () => {
    expect(score('Ac Ad Kh 7s 4d 3c 2h')).toBeGreaterThan(score('Ac Ad Qh 7s 4d 3c 2h'));
    expect(score('Qc Qd Qh Qs Ac 2d 3h')).toBeGreaterThan(score('Qc Qd Qh Qs Kc 2d 3h'));
  });

  it('uses the best kicker when a hand has three pairs', () => {
    expect(score('Ac Ad Kc Kd Qc Qd Jh')).toBe(score('Ac Ad Kc Kd Qc Qd 2h'));
  });

  it('picks the best full house from two trips', () => {
    expect(score('Kc Kd Kh 7c 7d 7h 2s')).toBe(score('Kc Kd Kh 7c 7d 2h 2s'));
  });

  it('plays only the best five cards of a flush', () => {
    expect(score('Ah Kh 9h 7h 5h 3h 2h')).toBe(score('Ah Kh 9h 7h 5h Qd Jd'));
  });

  it('prefers the highest of several straights', () => {
    expect(score('4c 5d 6h 7s 8c 9d 2c')).toBeGreaterThan(score('4c 5d 6h 7s 8c Kd 2c'));
  });

  it('rejects invalid card counts', () => {
    expect(() => evaluate(parseCards('As Ks Qs Js'))).toThrow(RangeError);
  });
});

describe('evaluate: exhaustive check', () => {
  it('matches the known frequency of every 5-card category (2,598,960 hands)', () => {
    const deck = createDeck();
    const counts = new Array<number>(9).fill(0);
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              counts[evaluate([deck[a]!, deck[b]!, deck[c]!, deck[d]!, deck[e]!]).category]!++;
            }
    expect(counts).toEqual([1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 40]);
  }, 120_000);
});

describe('evaluate: 7 cards', () => {
  it('equals the best of all 21 five-card subsets', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(createDeck(), { minLength: 7, maxLength: 7 }), (cards: Card[]) => {
        let best = -1;
        for (let i = 0; i < 6; i++) {
          for (let j = i + 1; j < 7; j++) {
            const five = cards.filter((_, k) => k !== i && k !== j);
            best = Math.max(best, evaluate(five).score);
          }
        }
        expect(evaluate(cards).score).toBe(best);
      }),
      { numRuns: 2000 },
    );
  });
});
