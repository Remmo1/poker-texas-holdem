import { minChips } from './chips.js';
import { activeSeats, getSeat, seatsClockwiseAfter } from './state.js';
/** A seat that already acted may raise again only if the bet grew by at least a full raise since. */
export function canRaiseAgain(state, seat) {
    return seat.levelAtLastAction === null || state.currentBet - seat.levelAtLastAction >= state.minRaise;
}
function needsToAct(state, seat, activeCount) {
    if (seat.status !== 'active')
        return false;
    const owes = seat.bet < state.currentBet;
    // A lone player with chips has nobody to bet against.
    if (activeCount === 1 && !owes)
        return false;
    return owes || seat.levelAtLastAction === null;
}
/** Next seat clockwise after `from` that must still act this round, or null if the round is over. */
export function nextSeatToAct(state, from) {
    const activeCount = activeSeats(state).length;
    return seatsClockwiseAfter(state, from).find((s) => needsToAct(state, s, activeCount))?.seat ?? null;
}
export function getLegalActions(state) {
    if (state.status === 'complete' || state.toAct === null)
        return null;
    const seat = getSeat(state, state.toAct);
    const owed = state.currentBet - seat.bet;
    const max = seat.bet + seat.stack;
    const hasOpponentToRespond = state.seats.some((s) => s.seat !== seat.seat && s.status === 'active');
    const canRaise = seat.stack > owed && canRaiseAgain(state, seat) && hasOpponentToRespond;
    return {
        seat: seat.seat,
        toCall: minChips(owed, seat.stack),
        canCheck: owed === 0n,
        canCall: owed > 0n,
        raise: canRaise
            ? {
                kind: state.currentBet === 0n ? 'bet' : 'raise',
                min: minChips(state.currentBet + state.minRaise, max),
                max,
            }
            : null,
    };
}
//# sourceMappingURL=rules.js.map