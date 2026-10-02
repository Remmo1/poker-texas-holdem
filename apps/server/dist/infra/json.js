/** JSON codec that survives bigint (chips) round-trips through jsonb columns. */
export function encodeJson(value) {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v));
}
export function reviveBigints(value) {
    if (Array.isArray(value))
        return value.map((v) => reviveBigints(v));
    if (value && typeof value === 'object') {
        const record = value;
        if (typeof record['$bigint'] === 'string' && Object.keys(record).length === 1) {
            return BigInt(record['$bigint']);
        }
        return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, reviveBigints(v)]));
    }
    return value;
}
//# sourceMappingURL=json.js.map