/** JSON codec that survives bigint (chips) round-trips through jsonb columns. */
export declare function encodeJson(value: unknown): string;
export declare function reviveBigints<T>(value: unknown): T;
