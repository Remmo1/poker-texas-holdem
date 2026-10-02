import type { Card } from './types.js';
export interface Rng {
    /** Uniform integer in [0, maxExclusive). */
    nextInt(maxExclusive: number): number;
}
/** CSPRNG-backed RNG with rejection sampling (no modulo bias). Use for real games. */
export declare function secureRng(): Rng;
/** Deterministic RNG (mulberry32) for tests and simulations only; never for real games. */
export declare function seededRng(seed: number): Rng;
/** Fisher-Yates shuffle; returns a new array. */
export declare function shuffle<T>(items: readonly T[], rng: Rng): T[];
export declare function shuffledDeck(rng: Rng): Card[];
