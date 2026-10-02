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
export declare const toWireConfig: (c: TableConfig) => WireTableConfig;
export declare function fromWireConfig(json: unknown): TableConfig;
