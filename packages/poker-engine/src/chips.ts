import type { Chips } from './types.js';

export const minChips = (a: Chips, b: Chips): Chips => (a < b ? a : b);
export const maxChips = (a: Chips, b: Chips): Chips => (a > b ? a : b);
export const sumChips = (values: Iterable<Chips>): Chips => {
  let total = 0n;
  for (const v of values) total += v;
  return total;
};
export const compareChips = (a: Chips, b: Chips): number => (a < b ? -1 : a > b ? 1 : 0);
