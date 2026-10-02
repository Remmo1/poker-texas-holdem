import { createDeck } from './cards.js';
/** CSPRNG-backed RNG with rejection sampling (no modulo bias). Use for real games. */
export function secureRng() {
    const buffer = new Uint32Array(1);
    return {
        nextInt(maxExclusive) {
            if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
                throw new RangeError(`maxExclusive out of range: ${maxExclusive}`);
            }
            const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
            let value;
            do {
                globalThis.crypto.getRandomValues(buffer);
                value = buffer[0];
            } while (value >= limit);
            return value % maxExclusive;
        },
    };
}
/** Deterministic RNG (mulberry32) for tests and simulations only; never for real games. */
export function seededRng(seed) {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { nextInt: (maxExclusive) => Math.floor(next() * maxExclusive) };
}
/** Fisher-Yates shuffle; returns a new array. */
export function shuffle(items, rng) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
export function shuffledDeck(rng) {
    return shuffle(createDeck(), rng);
}
//# sourceMappingURL=rng.js.map