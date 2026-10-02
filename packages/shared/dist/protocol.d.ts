import { z } from 'zod';
export declare const PROTOCOL_VERSION = 1;
/** Chip amounts travel as decimal strings; JSON has no bigint. */
export declare const chipsSchema: z.ZodString;
export declare const cardSchema: z.ZodString;
export declare const seatSchema: z.ZodNumber;
export declare const errorCodeSchema: z.ZodEnum<{
    ALREADY_SEATED: "ALREADY_SEATED";
    BAD_REQUEST: "BAD_REQUEST";
    ILLEGAL_ACTION: "ILLEGAL_ACTION";
    INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS";
    INTERNAL: "INTERNAL";
    INVALID_AMOUNT: "INVALID_AMOUNT";
    INVALID_BUY_IN: "INVALID_BUY_IN";
    NOT_SEATED: "NOT_SEATED";
    NOT_YOUR_TURN: "NOT_YOUR_TURN";
    NO_ACTIVE_HAND: "NO_ACTIVE_HAND";
    RATE_LIMITED: "RATE_LIMITED";
    SEAT_TAKEN: "SEAT_TAKEN";
    STALE_SEQ: "STALE_SEQ";
    TABLE_NOT_FOUND: "TABLE_NOT_FOUND";
    UNAUTHENTICATED: "UNAUTHENTICATED";
}>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export declare const actionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"fold">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"check">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"call">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"allin">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"bet">;
    to: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"raise">;
    to: z.ZodString;
}, z.core.$strip>], "type">;
export type WireAction = z.infer<typeof actionSchema>;
export declare const legalActionsSchema: z.ZodObject<{
    toCall: z.ZodString;
    canCheck: z.ZodBoolean;
    canCall: z.ZodBoolean;
    raise: z.ZodNullable<z.ZodObject<{
        kind: z.ZodEnum<{
            bet: "bet";
            raise: "raise";
        }>;
        min: z.ZodString;
        max: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type WireLegalActions = z.infer<typeof legalActionsSchema>;
export declare const streetSchema: z.ZodEnum<{
    flop: "flop";
    preflop: "preflop";
    river: "river";
    showdown: "showdown";
    turn: "turn";
}>;
export declare const tableConfigSchema: z.ZodObject<{
    maxSeats: z.ZodNumber;
    smallBlind: z.ZodString;
    bigBlind: z.ZodString;
    minBuyIn: z.ZodString;
    maxBuyIn: z.ZodString;
    actionTimeMs: z.ZodNumber;
}, z.core.$strip>;
export declare const seatViewSchema: z.ZodObject<{
    seat: z.ZodNumber;
    userId: z.ZodString;
    username: z.ZodString;
    stack: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        allin: "allin";
        folded: "folded";
        waiting: "waiting";
    }>;
    bet: z.ZodString;
}, z.core.$strip>;
export declare const handViewSchema: z.ZodObject<{
    handId: z.ZodString;
    handNo: z.ZodNumber;
    deckCommit: z.ZodString;
    buttonSeat: z.ZodNumber;
    smallBlindSeat: z.ZodNumber;
    bigBlindSeat: z.ZodNumber;
    street: z.ZodEnum<{
        flop: "flop";
        preflop: "preflop";
        river: "river";
        showdown: "showdown";
        turn: "turn";
    }>;
    board: z.ZodArray<z.ZodString>;
    currentBet: z.ZodString;
    minRaise: z.ZodString;
    pot: z.ZodString;
    toAct: z.ZodNullable<z.ZodNumber>;
    actionSeq: z.ZodNumber;
    deadline: z.ZodNullable<z.ZodNumber>;
    legal: z.ZodNullable<z.ZodObject<{
        toCall: z.ZodString;
        canCheck: z.ZodBoolean;
        canCall: z.ZodBoolean;
        raise: z.ZodNullable<z.ZodObject<{
            kind: z.ZodEnum<{
                bet: "bet";
                raise: "raise";
            }>;
            min: z.ZodString;
            max: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const tableSnapshotSchema: z.ZodObject<{
    tableId: z.ZodString;
    name: z.ZodString;
    config: z.ZodObject<{
        maxSeats: z.ZodNumber;
        smallBlind: z.ZodString;
        bigBlind: z.ZodString;
        minBuyIn: z.ZodString;
        maxBuyIn: z.ZodString;
        actionTimeMs: z.ZodNumber;
    }, z.core.$strip>;
    seats: z.ZodArray<z.ZodObject<{
        seat: z.ZodNumber;
        userId: z.ZodString;
        username: z.ZodString;
        stack: z.ZodString;
        status: z.ZodEnum<{
            active: "active";
            allin: "allin";
            folded: "folded";
            waiting: "waiting";
        }>;
        bet: z.ZodString;
    }, z.core.$strip>>;
    hand: z.ZodNullable<z.ZodObject<{
        handId: z.ZodString;
        handNo: z.ZodNumber;
        deckCommit: z.ZodString;
        buttonSeat: z.ZodNumber;
        smallBlindSeat: z.ZodNumber;
        bigBlindSeat: z.ZodNumber;
        street: z.ZodEnum<{
            flop: "flop";
            preflop: "preflop";
            river: "river";
            showdown: "showdown";
            turn: "turn";
        }>;
        board: z.ZodArray<z.ZodString>;
        currentBet: z.ZodString;
        minRaise: z.ZodString;
        pot: z.ZodString;
        toAct: z.ZodNullable<z.ZodNumber>;
        actionSeq: z.ZodNumber;
        deadline: z.ZodNullable<z.ZodNumber>;
        legal: z.ZodNullable<z.ZodObject<{
            toCall: z.ZodString;
            canCheck: z.ZodBoolean;
            canCall: z.ZodBoolean;
            raise: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    bet: "bet";
                    raise: "raise";
                }>;
                min: z.ZodString;
                max: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    you: z.ZodNullable<z.ZodObject<{
        seat: z.ZodNumber;
        holeCards: z.ZodNullable<z.ZodTuple<[z.ZodString, z.ZodString], null>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TableSnapshot = z.infer<typeof tableSnapshotSchema>;
export declare const clientMessageSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"auth.hello">;
    payload: z.ZodObject<{
        ticket: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"table.join">;
    payload: z.ZodObject<{
        tableId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"table.leave">;
    payload: z.ZodObject<{
        tableId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"table.sit">;
    payload: z.ZodObject<{
        tableId: z.ZodString;
        seat: z.ZodNumber;
        buyIn: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"table.stand">;
    payload: z.ZodObject<{
        tableId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"table.action">;
    payload: z.ZodObject<{
        tableId: z.ZodString;
        handId: z.ZodString;
        actionSeq: z.ZodNumber;
        action: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"fold">;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"check">;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"call">;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"allin">;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"bet">;
            to: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"raise">;
            to: z.ZodString;
        }, z.core.$strip>], "type">;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"sync.resume">;
    payload: z.ZodObject<{
        tableId: z.ZodString;
        lastSeq: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    type: z.ZodLiteral<"ping">;
    payload: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>], "type">;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ParseResult<T> = {
    ok: true;
    message: T;
} | {
    ok: false;
    error: string;
};
export declare function parseClientMessage(raw: string): ParseResult<ClientMessage>;
export declare const tableEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"player.seated">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        userId: z.ZodString;
        username: z.ZodString;
        stack: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"player.left">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        userId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"hand.started">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        handId: z.ZodString;
        handNo: z.ZodNumber;
        deckCommit: z.ZodString;
        buttonSeat: z.ZodNumber;
        smallBlindSeat: z.ZodNumber;
        bigBlindSeat: z.ZodNumber;
        players: z.ZodArray<z.ZodObject<{
            seat: z.ZodNumber;
            userId: z.ZodString;
            stack: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"blind.posted">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        blind: z.ZodEnum<{
            big: "big";
            small: "small";
        }>;
        amount: z.ZodString;
        allIn: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"cards.dealt">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        cards: z.ZodOptional<z.ZodTuple<[z.ZodString, z.ZodString], null>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"action.requested">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        actionSeq: z.ZodNumber;
        deadline: z.ZodNullable<z.ZodNumber>;
        legal: z.ZodObject<{
            toCall: z.ZodString;
            canCheck: z.ZodBoolean;
            canCall: z.ZodBoolean;
            raise: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    bet: "bet";
                    raise: "raise";
                }>;
                min: z.ZodString;
                max: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"action.applied">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        action: z.ZodEnum<{
            bet: "bet";
            call: "call";
            check: "check";
            fold: "fold";
            raise: "raise";
        }>;
        amount: z.ZodString;
        betTotal: z.ZodString;
        allIn: z.ZodBoolean;
        currentBet: z.ZodString;
        minRaise: z.ZodString;
        actionSeq: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"street.advanced">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        street: z.ZodEnum<{
            flop: "flop";
            river: "river";
            turn: "turn";
        }>;
        cards: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"uncalled.returned">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        amount: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"showdown">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        reveals: z.ZodArray<z.ZodObject<{
            seat: z.ZodNumber;
            cards: z.ZodTuple<[z.ZodString, z.ZodString], null>;
            category: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"pot.awarded">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        potIndex: z.ZodNumber;
        seat: z.ZodNumber;
        amount: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"hand.ended">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        handId: z.ZodString;
        deck: z.ZodArray<z.ZodString>;
        salt: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>], "type">;
export type TableEvent = z.infer<typeof tableEventSchema>;
export type TableEventType = TableEvent['type'];
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A table event before the transport adds `v`, `tableId`, `seq` and `ts`. */
export type TableEventBody = DistributiveOmit<TableEvent, 'v' | 'tableId' | 'seq' | 'ts'>;
export declare const serverMessageSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"auth.ok">;
    id: z.ZodString;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        userId: z.ZodString;
        username: z.ZodString;
        serverTime: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"cmd.ack">;
    id: z.ZodString;
    ts: z.ZodNumber;
    payload: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"cmd.reject">;
    id: z.ZodOptional<z.ZodString>;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        code: z.ZodEnum<{
            ALREADY_SEATED: "ALREADY_SEATED";
            BAD_REQUEST: "BAD_REQUEST";
            ILLEGAL_ACTION: "ILLEGAL_ACTION";
            INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS";
            INTERNAL: "INTERNAL";
            INVALID_AMOUNT: "INVALID_AMOUNT";
            INVALID_BUY_IN: "INVALID_BUY_IN";
            NOT_SEATED: "NOT_SEATED";
            NOT_YOUR_TURN: "NOT_YOUR_TURN";
            NO_ACTIVE_HAND: "NO_ACTIVE_HAND";
            RATE_LIMITED: "RATE_LIMITED";
            SEAT_TAKEN: "SEAT_TAKEN";
            STALE_SEQ: "STALE_SEQ";
            TABLE_NOT_FOUND: "TABLE_NOT_FOUND";
            UNAUTHENTICATED: "UNAUTHENTICATED";
        }>;
        message: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"table.snapshot">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        tableId: z.ZodString;
        name: z.ZodString;
        config: z.ZodObject<{
            maxSeats: z.ZodNumber;
            smallBlind: z.ZodString;
            bigBlind: z.ZodString;
            minBuyIn: z.ZodString;
            maxBuyIn: z.ZodString;
            actionTimeMs: z.ZodNumber;
        }, z.core.$strip>;
        seats: z.ZodArray<z.ZodObject<{
            seat: z.ZodNumber;
            userId: z.ZodString;
            username: z.ZodString;
            stack: z.ZodString;
            status: z.ZodEnum<{
                active: "active";
                allin: "allin";
                folded: "folded";
                waiting: "waiting";
            }>;
            bet: z.ZodString;
        }, z.core.$strip>>;
        hand: z.ZodNullable<z.ZodObject<{
            handId: z.ZodString;
            handNo: z.ZodNumber;
            deckCommit: z.ZodString;
            buttonSeat: z.ZodNumber;
            smallBlindSeat: z.ZodNumber;
            bigBlindSeat: z.ZodNumber;
            street: z.ZodEnum<{
                flop: "flop";
                preflop: "preflop";
                river: "river";
                showdown: "showdown";
                turn: "turn";
            }>;
            board: z.ZodArray<z.ZodString>;
            currentBet: z.ZodString;
            minRaise: z.ZodString;
            pot: z.ZodString;
            toAct: z.ZodNullable<z.ZodNumber>;
            actionSeq: z.ZodNumber;
            deadline: z.ZodNullable<z.ZodNumber>;
            legal: z.ZodNullable<z.ZodObject<{
                toCall: z.ZodString;
                canCheck: z.ZodBoolean;
                canCall: z.ZodBoolean;
                raise: z.ZodNullable<z.ZodObject<{
                    kind: z.ZodEnum<{
                        bet: "bet";
                        raise: "raise";
                    }>;
                    min: z.ZodString;
                    max: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        you: z.ZodNullable<z.ZodObject<{
            seat: z.ZodNumber;
            holeCards: z.ZodNullable<z.ZodTuple<[z.ZodString, z.ZodString], null>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"pong">;
    id: z.ZodString;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        serverTime: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"player.seated">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        userId: z.ZodString;
        username: z.ZodString;
        stack: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"player.left">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        userId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"hand.started">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        handId: z.ZodString;
        handNo: z.ZodNumber;
        deckCommit: z.ZodString;
        buttonSeat: z.ZodNumber;
        smallBlindSeat: z.ZodNumber;
        bigBlindSeat: z.ZodNumber;
        players: z.ZodArray<z.ZodObject<{
            seat: z.ZodNumber;
            userId: z.ZodString;
            stack: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"blind.posted">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        blind: z.ZodEnum<{
            big: "big";
            small: "small";
        }>;
        amount: z.ZodString;
        allIn: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"cards.dealt">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        cards: z.ZodOptional<z.ZodTuple<[z.ZodString, z.ZodString], null>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"action.requested">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        actionSeq: z.ZodNumber;
        deadline: z.ZodNullable<z.ZodNumber>;
        legal: z.ZodObject<{
            toCall: z.ZodString;
            canCheck: z.ZodBoolean;
            canCall: z.ZodBoolean;
            raise: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    bet: "bet";
                    raise: "raise";
                }>;
                min: z.ZodString;
                max: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"action.applied">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        action: z.ZodEnum<{
            bet: "bet";
            call: "call";
            check: "check";
            fold: "fold";
            raise: "raise";
        }>;
        amount: z.ZodString;
        betTotal: z.ZodString;
        allIn: z.ZodBoolean;
        currentBet: z.ZodString;
        minRaise: z.ZodString;
        actionSeq: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"street.advanced">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        street: z.ZodEnum<{
            flop: "flop";
            river: "river";
            turn: "turn";
        }>;
        cards: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"uncalled.returned">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        seat: z.ZodNumber;
        amount: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"showdown">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        reveals: z.ZodArray<z.ZodObject<{
            seat: z.ZodNumber;
            cards: z.ZodTuple<[z.ZodString, z.ZodString], null>;
            category: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"pot.awarded">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        potIndex: z.ZodNumber;
        seat: z.ZodNumber;
        amount: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<"hand.ended">;
    tableId: z.ZodString;
    seq: z.ZodNumber;
    ts: z.ZodNumber;
    payload: z.ZodObject<{
        handId: z.ZodString;
        deck: z.ZodArray<z.ZodString>;
        salt: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>], "type">;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export declare const registerRequestSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const loginRequestSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const tableSummarySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    config: z.ZodObject<{
        maxSeats: z.ZodNumber;
        smallBlind: z.ZodString;
        bigBlind: z.ZodString;
        minBuyIn: z.ZodString;
        maxBuyIn: z.ZodString;
        actionTimeMs: z.ZodNumber;
    }, z.core.$strip>;
    seated: z.ZodNumber;
}, z.core.$strip>;
export type TableSummary = z.infer<typeof tableSummarySchema>;
export {};
