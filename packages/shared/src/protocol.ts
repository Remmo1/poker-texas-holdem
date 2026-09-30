import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

/** Chip amounts travel as decimal strings; JSON has no bigint. */
export const chipsSchema = z.string().regex(/^\d{1,18}$/, 'Expected a non-negative integer string');
export const cardSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/, 'Expected a card such as "As"');
export const seatSchema = z.number().int().min(0).max(9);
const idSchema = z.string().min(1).max(64);

export const errorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'TABLE_NOT_FOUND',
  'SEAT_TAKEN',
  'ALREADY_SEATED',
  'NOT_SEATED',
  'INVALID_BUY_IN',
  'INSUFFICIENT_FUNDS',
  'NO_ACTIVE_HAND',
  'STALE_SEQ',
  'NOT_YOUR_TURN',
  'ILLEGAL_ACTION',
  'INVALID_AMOUNT',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fold') }),
  z.object({ type: z.literal('check') }),
  z.object({ type: z.literal('call') }),
  z.object({ type: z.literal('allin') }),
  /** `to` is the total bet for the round ("raise to"). */
  z.object({ type: z.literal('bet'), to: chipsSchema }),
  z.object({ type: z.literal('raise'), to: chipsSchema }),
]);
export type WireAction = z.infer<typeof actionSchema>;

export const legalActionsSchema = z.object({
  toCall: chipsSchema,
  canCheck: z.boolean(),
  canCall: z.boolean(),
  raise: z.object({ kind: z.enum(['bet', 'raise']), min: chipsSchema, max: chipsSchema }).nullable(),
});
export type WireLegalActions = z.infer<typeof legalActionsSchema>;

export const streetSchema = z.enum(['preflop', 'flop', 'turn', 'river', 'showdown']);

export const tableConfigSchema = z.object({
  maxSeats: z.number().int().min(2).max(10),
  smallBlind: chipsSchema,
  bigBlind: chipsSchema,
  minBuyIn: chipsSchema,
  maxBuyIn: chipsSchema,
  actionTimeMs: z.number().int().positive(),
});

export const seatViewSchema = z.object({
  seat: seatSchema,
  userId: idSchema,
  username: z.string(),
  stack: chipsSchema,
  /** `waiting` = seated but not dealt into the current hand. */
  status: z.enum(['waiting', 'active', 'folded', 'allin']),
  bet: chipsSchema,
});

export const handViewSchema = z.object({
  handId: idSchema,
  handNo: z.number().int(),
  deckCommit: z.string(),
  buttonSeat: seatSchema,
  smallBlindSeat: seatSchema,
  bigBlindSeat: seatSchema,
  street: streetSchema,
  board: z.array(cardSchema),
  currentBet: chipsSchema,
  minRaise: chipsSchema,
  pot: chipsSchema,
  toAct: seatSchema.nullable(),
  actionSeq: z.number().int(),
  deadline: z.number().nullable(),
  legal: legalActionsSchema.nullable(),
});

export const tableSnapshotSchema = z.object({
  tableId: idSchema,
  name: z.string(),
  config: tableConfigSchema,
  seats: z.array(seatViewSchema),
  hand: handViewSchema.nullable(),
  /** The recipient's own seat and hole cards; never anyone else's. */
  you: z.object({ seat: seatSchema, holeCards: z.tuple([cardSchema, cardSchema]).nullable() }).nullable(),
});
export type TableSnapshot = z.infer<typeof tableSnapshotSchema>;

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

const command = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ v: z.literal(PROTOCOL_VERSION), id: idSchema, type: z.literal(type), payload });

export const clientMessageSchema = z.discriminatedUnion('type', [
  command('auth.hello', z.object({ ticket: z.string().min(1).max(256) })),
  command('table.join', z.object({ tableId: idSchema })),
  command('table.leave', z.object({ tableId: idSchema })),
  command('table.sit', z.object({ tableId: idSchema, seat: seatSchema, buyIn: chipsSchema })),
  command('table.stand', z.object({ tableId: idSchema })),
  command(
    'table.action',
    z.object({
      tableId: idSchema,
      handId: idSchema,
      /** Echo of `actionSeq` from the `action.requested` event being answered. */
      actionSeq: z.number().int().min(0),
      action: actionSchema,
    }),
  ),
  command('sync.resume', z.object({ tableId: idSchema, lastSeq: z.number().int().min(0) })),
  command('ping', z.object({})),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Malformed JSON' };
  }
  const parsed = clientMessageSchema.safeParse(json);
  return parsed.success ? { ok: true, message: parsed.data } : { ok: false, error: parsed.error.message };
}

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

const tableEvent = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    tableId: idSchema,
    /** Strictly increasing per table; a gap means the client must send `sync.resume`. */
    seq: z.number().int().min(1),
    ts: z.number(),
    payload,
  });

export const tableEventSchema = z.discriminatedUnion('type', [
  tableEvent(
    'player.seated',
    z.object({ seat: seatSchema, userId: idSchema, username: z.string(), stack: chipsSchema }),
  ),
  tableEvent('player.left', z.object({ seat: seatSchema, userId: idSchema })),
  tableEvent(
    'hand.started',
    z.object({
      handId: idSchema,
      handNo: z.number().int(),
      deckCommit: z.string(),
      buttonSeat: seatSchema,
      smallBlindSeat: seatSchema,
      bigBlindSeat: seatSchema,
      players: z.array(z.object({ seat: seatSchema, userId: idSchema, stack: chipsSchema })),
    }),
  ),
  tableEvent(
    'blind.posted',
    z.object({ seat: seatSchema, blind: z.enum(['small', 'big']), amount: chipsSchema, allIn: z.boolean() }),
  ),
  /** `cards` is present only for the seat's owner. */
  tableEvent('cards.dealt', z.object({ seat: seatSchema, cards: z.tuple([cardSchema, cardSchema]).optional() })),
  tableEvent(
    'action.requested',
    z.object({
      seat: seatSchema,
      actionSeq: z.number().int().min(0),
      deadline: z.number().nullable(),
      legal: legalActionsSchema,
    }),
  ),
  tableEvent(
    'action.applied',
    z.object({
      seat: seatSchema,
      action: z.enum(['fold', 'check', 'call', 'bet', 'raise']),
      amount: chipsSchema,
      betTotal: chipsSchema,
      allIn: z.boolean(),
      currentBet: chipsSchema,
      minRaise: chipsSchema,
      actionSeq: z.number().int().min(1),
    }),
  ),
  tableEvent('street.advanced', z.object({ street: z.enum(['flop', 'turn', 'river']), cards: z.array(cardSchema) })),
  tableEvent('uncalled.returned', z.object({ seat: seatSchema, amount: chipsSchema })),
  tableEvent(
    'showdown',
    z.object({
      reveals: z.array(z.object({ seat: seatSchema, cards: z.tuple([cardSchema, cardSchema]), category: z.number() })),
    }),
  ),
  tableEvent('pot.awarded', z.object({ potIndex: z.number().int(), seat: seatSchema, amount: chipsSchema })),
  /** The full deck and salt are revealed so players can verify `deckCommit`. */
  tableEvent(
    'hand.ended',
    z.object({ handId: idSchema, deck: z.array(cardSchema).min(52).max(52), salt: z.string() }),
  ),
]);
export type TableEvent = z.infer<typeof tableEventSchema>;
export type TableEventType = TableEvent['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A table event before the transport adds `v`, `tableId`, `seq` and `ts`. */
export type TableEventBody = DistributiveOmit<TableEvent, 'v' | 'tableId' | 'seq' | 'ts'>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal('auth.ok'),
    id: idSchema,
    ts: z.number(),
    payload: z.object({ userId: idSchema, username: z.string(), serverTime: z.number() }),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal('cmd.ack'),
    id: idSchema,
    ts: z.number(),
    payload: z.object({}),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal('cmd.reject'),
    id: idSchema.optional(),
    ts: z.number(),
    payload: z.object({ code: errorCodeSchema, message: z.string() }),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal('table.snapshot'),
    tableId: idSchema,
    /** The snapshot reflects every event up to and including this seq. */
    seq: z.number().int().min(0),
    ts: z.number(),
    payload: tableSnapshotSchema,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal('pong'),
    id: idSchema,
    ts: z.number(),
    payload: z.object({ serverTime: z.number() }),
  }),
  ...tableEventSchema.options,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export const registerRequestSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9_]+$/, 'Letters, digits and underscore only'),
  password: z.string().min(8).max(128),
});
export const loginRequestSchema = z.object({ username: z.string().min(1).max(20), password: z.string().min(1).max(128) });

export const tableSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  config: tableConfigSchema,
  seated: z.number().int(),
});
export type TableSummary = z.infer<typeof tableSummarySchema>;
