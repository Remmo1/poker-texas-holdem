import { cardToString, getLegalActions } from '@holdem/poker-engine';
const chips = (value) => value.toString();
export function toWireLegal(legal) {
    return {
        toCall: chips(legal.toCall),
        canCheck: legal.canCheck,
        canCall: legal.canCall,
        raise: legal.raise ? { kind: legal.raise.kind, min: chips(legal.raise.min), max: chips(legal.raise.max) } : null,
    };
}
/**
 * The only place engine events become client-visible messages. Anything not mapped here, notably the
 * deck in HandStarted and other players' hole cards, never leaves the server.
 */
export function projectHandEvent(event, ctx) {
    switch (event.type) {
        case 'HandStarted':
            return {
                public: {
                    type: 'hand.started',
                    payload: {
                        handId: event.handId,
                        handNo: ctx.handNo,
                        deckCommit: ctx.deckCommit,
                        buttonSeat: event.buttonSeat,
                        smallBlindSeat: event.smallBlindSeat,
                        bigBlindSeat: event.bigBlindSeat,
                        players: event.players.map((p) => ({
                            seat: p.seat,
                            userId: ctx.userIdBySeat.get(p.seat),
                            stack: chips(p.stack),
                        })),
                    },
                },
            };
        case 'BlindPosted':
            return {
                public: {
                    type: 'blind.posted',
                    payload: { seat: event.seat, blind: event.blind, amount: chips(event.amount), allIn: event.allIn },
                },
            };
        case 'HoleCardsDealt':
            return {
                public: { type: 'cards.dealt', payload: { seat: event.seat } },
                forSeat: {
                    seat: event.seat,
                    event: {
                        type: 'cards.dealt',
                        payload: { seat: event.seat, cards: [cardToString(event.cards[0]), cardToString(event.cards[1])] },
                    },
                },
            };
        case 'ActionRequested':
            return {
                public: {
                    type: 'action.requested',
                    payload: {
                        seat: event.seat,
                        actionSeq: ctx.state.actionSeq,
                        deadline: ctx.deadline,
                        legal: toWireLegal(getLegalActions(ctx.state)),
                    },
                },
            };
        case 'ActionApplied':
            return {
                public: {
                    type: 'action.applied',
                    payload: {
                        seat: event.seat,
                        action: event.action,
                        amount: chips(event.amount),
                        betTotal: chips(event.betTotal),
                        allIn: event.allIn,
                        currentBet: chips(event.currentBet),
                        minRaise: chips(event.minRaise),
                        actionSeq: event.actionSeq,
                    },
                },
            };
        case 'StreetAdvanced':
            return { public: { type: 'street.advanced', payload: { street: event.street, cards: event.cards.map(cardToString) } } };
        case 'UncalledBetReturned':
            return { public: { type: 'uncalled.returned', payload: { seat: event.seat, amount: chips(event.amount) } } };
        case 'ShowdownRevealed':
            return {
                public: {
                    type: 'showdown',
                    payload: {
                        reveals: event.reveals.map((r) => ({
                            seat: r.seat,
                            cards: [cardToString(r.cards[0]), cardToString(r.cards[1])],
                            category: r.category,
                        })),
                    },
                },
            };
        case 'PotsFormed':
            return null;
        case 'PotAwarded':
            return {
                public: { type: 'pot.awarded', payload: { potIndex: event.potIndex, seat: event.seat, amount: chips(event.amount) } },
            };
        case 'HandEnded':
            return {
                public: {
                    type: 'hand.ended',
                    payload: {
                        handId: ctx.state.handId,
                        deck: ctx.reveal.deck.map(cardToString),
                        salt: ctx.reveal.salt,
                    },
                },
            };
    }
}
//# sourceMappingURL=projection.js.map