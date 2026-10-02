import { createHash, randomBytes } from 'node:crypto';
import { cardToString, secureRng, shuffledDeck } from '@holdem/poker-engine';
import { deckCommitPreimage } from '@holdem/shared';
export const DECK_SOURCE = Symbol('DECK_SOURCE');
export const secureDeckSource = () => ({
    deck: shuffledDeck(secureRng()),
    salt: randomBytes(16).toString('hex'),
});
/** Commitment published before the deal; the deck and salt are revealed after the hand so players can verify it. */
export function commitDeck(deck, salt) {
    return createHash('sha256').update(deckCommitPreimage(deck.map(cardToString), salt)).digest('hex');
}
//# sourceMappingURL=fairness.js.map