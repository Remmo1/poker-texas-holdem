import { deckCommitPreimage } from '@holdem/shared';

/** Checks that the deck revealed after a hand is the one the server committed to before dealing. */
export async function verifyDeckCommit(deck: readonly string[], salt: string, commit: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(deckCommitPreimage(deck, salt));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex === commit;
}
