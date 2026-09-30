import { tableConfigSchema } from '@holdem/shared';
import type { z } from 'zod';

export type WireTableConfig = z.infer<typeof tableConfigSchema>;

export interface TableConfig {
  readonly maxSeats: number;
  readonly smallBlind: bigint;
  readonly bigBlind: bigint;
  readonly minBuyIn: bigint;
  readonly maxBuyIn: bigint;
  readonly actionTimeMs: number;
}

export interface TableDefinition {
  readonly id: string;
  readonly name: string;
  readonly config: TableConfig;
}

export const toWireConfig = (c: TableConfig): WireTableConfig => ({
  maxSeats: c.maxSeats,
  smallBlind: c.smallBlind.toString(),
  bigBlind: c.bigBlind.toString(),
  minBuyIn: c.minBuyIn.toString(),
  maxBuyIn: c.maxBuyIn.toString(),
  actionTimeMs: c.actionTimeMs,
});

export function fromWireConfig(json: unknown): TableConfig {
  const c = tableConfigSchema.parse(json);
  return {
    maxSeats: c.maxSeats,
    smallBlind: BigInt(c.smallBlind),
    bigBlind: BigInt(c.bigBlind),
    minBuyIn: BigInt(c.minBuyIn),
    maxBuyIn: BigInt(c.maxBuyIn),
    actionTimeMs: c.actionTimeMs,
  };
}
