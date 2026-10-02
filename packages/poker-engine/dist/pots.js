import { compareChips } from './chips.js';
/**
 * Splits contributions into a main pot and side pots by commitment level.
 * Chips that no other player matched are returned as refunds instead of forming a pot.
 */
export function computePots(contributions) {
    const levels = [...new Set(contributions.filter((c) => c.committed > 0n).map((c) => c.committed))].sort(compareChips);
    const pots = [];
    const refunds = [];
    let previous = 0n;
    for (const level of levels) {
        const contributors = contributions.filter((c) => c.committed > previous);
        if (contributors.length === 1) {
            const only = contributors[0];
            refunds.push({ seat: only.seat, amount: only.committed - previous });
            break;
        }
        let amount = 0n;
        for (const c of contributors)
            amount += (c.committed < level ? c.committed : level) - previous;
        const eligible = contributors
            .filter((c) => !c.folded && c.committed >= level)
            .map((c) => c.seat)
            .sort((a, b) => a - b);
        const last = pots[pots.length - 1];
        if (last && last.eligible.join() === eligible.join()) {
            pots[pots.length - 1] = { amount: last.amount + amount, eligible };
        }
        else {
            pots.push({ amount, eligible });
        }
        previous = level;
    }
    return { pots, refunds };
}
//# sourceMappingURL=pots.js.map