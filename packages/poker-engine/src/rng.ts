import { createDeck } from './cards.js';
import type { Card } from './types.js';

export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

/** CSPRNG-backed RNG with rejection sampling (no modulo bias). Use for real games. */
export function secureRng(): Rng {
  const buffer = new Uint32Array(1);
  return {
    nextInt(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
        throw new RangeError(`maxExclusive out of range: ${maxExclusive}`);
      }
      const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
      let value: number;
      do {
        globalThis.crypto.getRandomValues(buffer);
        value = buffer[0]!;
      } while (value >= limit);
      return value % maxExclusive;
    },
  };
}

/** Deterministic RNG (mulberry32) for tests and simulations only; never for real games. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { nextInt: (maxExclusive) => Math.floor(next() * maxExclusive) };
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function shuffledDeck(rng: Rng): Card[] {
  return shuffle(createDeck(), rng);
}
