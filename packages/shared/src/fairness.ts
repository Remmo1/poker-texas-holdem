/** Exact text hashed (SHA-256, hex) for the deck commitment; server and clients must agree on it. */
export function deckCommitPreimage(deck: readonly string[], salt: string): string {
  return `${deck.join(' ')}|${salt}`;
}
