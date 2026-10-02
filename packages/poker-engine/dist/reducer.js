import { EngineError } from './errors.js';
export function createInitialState(event) {
    return {
        handId: event.handId,
        rules: event.rules,
        buttonSeat: event.buttonSeat,
        smallBlindSeat: event.smallBlindSeat,
        bigBlindSeat: event.bigBlindSeat,
        street: 'preflop',
        status: 'in_progress',
        seats: event.players.map((p) => ({
            seat: p.seat,
            playerId: p.playerId,
            stack: p.stack,
            status: 'active',
            holeCards: null,
            bet: 0n,
            totalCommitted: 0n,
            levelAtLastAction: null,
        })),
        board: [],
        deck: event.deck,
        currentBet: 0n,
        minRaise: event.rules.bigBlind,
        toAct: null,
        pots: [],
        actionSeq: 0,
    };
}
function mapSeat(state, seat, update) {
    return { ...state, seats: state.seats.map((s) => (s.seat === seat ? update(s) : s)) };
}
const applyBlind = (state, e) => ({
    ...mapSeat(state, e.seat, (s) => ({
        ...s,
        stack: s.stack - e.amount,
        bet: s.bet + e.amount,
        totalCommitted: s.totalCommitted + e.amount,
        status: e.allIn ? 'allin' : s.status,
    })),
    currentBet: e.currentBet,
});
const applyHoleCards = (state, e) => ({
    ...mapSeat(state, e.seat, (s) => ({ ...s, holeCards: e.cards })),
    deck: state.deck.slice(2),
});
const applyAction = (state, e) => ({
    ...mapSeat(state, e.seat, (s) => ({
        ...s,
        stack: s.stack - e.amount,
        bet: s.bet + e.amount,
        totalCommitted: s.totalCommitted + e.amount,
        status: e.action === 'fold' ? 'folded' : e.allIn ? 'allin' : s.status,
        levelAtLastAction: e.currentBet,
    })),
    currentBet: e.currentBet,
    minRaise: e.minRaise,
    toAct: null,
    actionSeq: e.actionSeq,
});
const applyStreet = (state, e) => ({
    ...state,
    street: e.street,
    board: [...state.board, ...e.cards],
    deck: state.deck.slice(e.cards.length),
    seats: state.seats.map((s) => ({ ...s, bet: 0n, levelAtLastAction: null })),
    currentBet: 0n,
    minRaise: state.rules.bigBlind,
    toAct: null,
});
const applyRefund = (state, e) => mapSeat(state, e.seat, (s) => ({
    ...s,
    stack: s.stack + e.amount,
    totalCommitted: s.totalCommitted - e.amount,
}));
const applyAward = (state, e) => mapSeat(state, e.seat, (s) => ({ ...s, stack: s.stack + e.amount }));
/** Pure reducer: every event fully determines its state change, so replaying events rebuilds the hand. */
export function applyEvent(state, event) {
    switch (event.type) {
        case 'HandStarted':
            throw new EngineError('INVALID_SETUP', 'HandStarted can only be the first event');
        case 'BlindPosted':
            return applyBlind(state, event);
        case 'HoleCardsDealt':
            return applyHoleCards(state, event);
        case 'ActionRequested':
            return { ...state, toAct: event.seat };
        case 'ActionApplied':
            return applyAction(state, event);
        case 'StreetAdvanced':
            return applyStreet(state, event);
        case 'UncalledBetReturned':
            return applyRefund(state, event);
        case 'ShowdownRevealed':
            return { ...state, street: 'showdown' };
        case 'PotsFormed':
            return { ...state, pots: event.pots };
        case 'PotAwarded':
            return applyAward(state, event);
        case 'HandEnded':
            return { ...state, status: 'complete', toAct: null };
    }
}
export function replay(events) {
    const [first, ...rest] = events;
    if (first?.type !== 'HandStarted') {
        throw new EngineError('INVALID_SETUP', 'Event stream must begin with HandStarted');
    }
    return rest.reduce((state, event) => applyEvent(state, event), createInitialState(first));
}
//# sourceMappingURL=reducer.js.map