import { createHash } from 'node:crypto';
import { deckCommitPreimage } from '@holdem/shared';
import { describe, expect, it } from 'vitest';
import { verifyDeckCommit } from '../src/net/fairness';

const commit = (deck: string[], salt: string) => createHash('sha256').update(deckCommitPreimage(deck, salt)).digest('hex');

describe('verifyDeckCommit', () => {
  const deck = ['Ah', 'Kd', 'Ac', 'Kh', '2c'];

  it('accepts the deck the server committed to', async () => {
    expect(await verifyDeckCommit(deck, 'salt', commit(deck, 'salt'))).toBe(true);
  });

  it('rejects a swapped card, a different order, or a different salt', async () => {
    const c = commit(deck, 'salt');
    expect(await verifyDeckCommit(['Ah', 'Kd', 'Ac', 'Kh', '3c'], 'salt', c)).toBe(false);
    expect(await verifyDeckCommit([...deck].reverse(), 'salt', c)).toBe(false);
    expect(await verifyDeckCommit(deck, 'other', c)).toBe(false);
  });

  it('matches the server\'s known commitment format', () => {
    expect(deckCommitPreimage(['Ah', 'Kd'], 'abc')).toBe('Ah Kd|abc');
  });
});
