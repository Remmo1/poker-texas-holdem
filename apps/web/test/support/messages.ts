import type { ServerMessage, TableSnapshot } from '@holdem/shared';

export const TABLE_ID = 't1';

export const snapshot = (overrides: Partial<TableSnapshot> = {}): TableSnapshot => ({
  tableId: TABLE_ID,
  name: 'Test table',
  config: { maxSeats: 6, smallBlind: '10', bigBlind: '20', minBuyIn: '400', maxBuyIn: '2000', actionTimeMs: 20_000 },
  seats: [],
  hand: null,
  you: null,
  ...overrides,
});

/** A server table event as it appears on the wire. */
export const event = (seq: number, type: string, payload: unknown): ServerMessage =>
  ({ v: 1, type, tableId: TABLE_ID, seq, ts: 1, payload }) as ServerMessage;

export const snapshotMessage = (seq: number, payload: TableSnapshot = snapshot()): ServerMessage => ({
  v: 1,
  type: 'table.snapshot',
  tableId: TABLE_ID,
  seq,
  ts: 1,
  payload,
});

export const ack = (id: string): ServerMessage => ({ v: 1, type: 'cmd.ack', id, ts: 1, payload: {} });

export const reject = (id: string, code: string, message: string): ServerMessage =>
  ({ v: 1, type: 'cmd.reject', id, ts: 1, payload: { code, message } }) as ServerMessage;

export const authOk = (id: string, userId = 'u-alice', username = 'alice'): ServerMessage => ({
  v: 1,
  type: 'auth.ok',
  id,
  ts: 1,
  payload: { userId, username, serverTime: Date.now() },
});

export const ALICE = { userId: 'u-alice', username: 'alice' };
export const BOB = { userId: 'u-bob', username: 'bob' };

const legal = (toCall: string, canCheck: boolean, raise: { kind: 'bet' | 'raise'; min: string; max: string } | null) => ({
  toCall,
  canCheck,
  canCall: !canCheck,
  raise,
});

/** A heads-up hand: alice (seat 0, the viewer) calls, bob checks, flop, then alice wins at showdown. */
export function headsUpHand(deck: readonly string[], salt: string, commit: string): ServerMessage[] {
  return [
    event(1, 'player.seated', { seat: 0, userId: ALICE.userId, username: 'alice', stack: '1000' }),
    event(2, 'player.seated', { seat: 1, userId: BOB.userId, username: 'bob', stack: '1000' }),
    event(3, 'hand.started', {
      handId: 'h1',
      handNo: 1,
      deckCommit: commit,
      buttonSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
      players: [
        { seat: 0, userId: ALICE.userId, stack: '1000' },
        { seat: 1, userId: BOB.userId, stack: '1000' },
      ],
    }),
    event(4, 'blind.posted', { seat: 0, blind: 'small', amount: '10', allIn: false }),
    event(5, 'blind.posted', { seat: 1, blind: 'big', amount: '20', allIn: false }),
    event(6, 'cards.dealt', { seat: 0, cards: ['Ah', 'Ac'] }),
    event(7, 'cards.dealt', { seat: 1 }),
    event(8, 'action.requested', { seat: 0, actionSeq: 0, deadline: 5000, legal: legal('10', false, { kind: 'raise', min: '40', max: '1000' }) }),
    event(9, 'action.applied', { seat: 0, action: 'call', amount: '10', betTotal: '20', allIn: false, currentBet: '20', minRaise: '20', actionSeq: 1 }),
    event(10, 'action.requested', { seat: 1, actionSeq: 1, deadline: 6000, legal: legal('0', true, { kind: 'raise', min: '40', max: '980' }) }),
    event(11, 'action.applied', { seat: 1, action: 'check', amount: '0', betTotal: '20', allIn: false, currentBet: '20', minRaise: '20', actionSeq: 2 }),
    event(12, 'street.advanced', { street: 'flop', cards: ['2c', '7d', '9s'] }),
    event(13, 'showdown', {
      reveals: [
        { seat: 0, cards: ['Ah', 'Ac'], category: 1 },
        { seat: 1, cards: ['Kd', 'Kh'], category: 1 },
      ],
    }),
    event(14, 'pot.awarded', { potIndex: 0, seat: 0, amount: '40' }),
    event(15, 'hand.ended', { handId: 'h1', deck, salt }),
  ];
}
