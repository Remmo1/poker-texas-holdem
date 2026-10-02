/** Exact text hashed (SHA-256, hex) for the deck commitment; server and clients must agree on it. */
export function deckCommitPreimage(deck, salt) {
    return `${deck.join(' ')}|${salt}`;
}
//# sourceMappingURL=fairness.js.map