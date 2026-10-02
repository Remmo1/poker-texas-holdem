import { sumChips } from './chips.js';
import { EngineError } from './errors.js';
export function getSeat(state, seat) {
    const found = state.seats.find((s) => s.seat === seat);
    if (!found)
        throw new EngineError('ILLEGAL_ACTION', `Seat ${seat} is not in this hand`);
    return found;
}
export const liveSeats = (state) => state.seats.filter((s) => s.status !== 'folded');
export const activeSeats = (state) => state.seats.filter((s) => s.status === 'active');
export const totalPot = (state) => sumChips(state.seats.map((s) => s.totalCommitted));
/** All seats in the hand in clockwise order, starting just after `from` and ending with `from`. */
export function seatsClockwiseAfter(state, from) {
    return [...state.seats.filter((s) => s.seat > from), ...state.seats.filter((s) => s.seat <= from)];
}
//# sourceMappingURL=state.js.map