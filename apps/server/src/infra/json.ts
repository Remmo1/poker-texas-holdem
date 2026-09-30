/** JSON codec that survives bigint (chips) round-trips through jsonb columns. */
export function encodeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v));
}

export function reviveBigints<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => reviveBigints(v)) as T;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['$bigint'] === 'string' && Object.keys(record).length === 1) {
      return BigInt(record['$bigint']) as T;
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, reviveBigints(v)])) as T;
  }
  return value as T;
}
