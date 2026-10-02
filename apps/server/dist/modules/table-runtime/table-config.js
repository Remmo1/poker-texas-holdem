import { tableConfigSchema } from '@holdem/shared';
export const toWireConfig = (c) => ({
    maxSeats: c.maxSeats,
    smallBlind: c.smallBlind.toString(),
    bigBlind: c.bigBlind.toString(),
    minBuyIn: c.minBuyIn.toString(),
    maxBuyIn: c.maxBuyIn.toString(),
    actionTimeMs: c.actionTimeMs,
});
export function fromWireConfig(json) {
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
//# sourceMappingURL=table-config.js.map