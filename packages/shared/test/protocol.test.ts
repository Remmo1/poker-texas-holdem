import { describe, expect, it } from 'vitest';
import { parseClientMessage, serverMessageSchema, tableEventSchema } from '../src/index.js';

const envelope = (type: string, payload: unknown, id = 'c1') => JSON.stringify({ v: 1, id, type, payload });

describe('parseClientMessage', () => {
  it('accepts a valid action', () => {
    const result = parseClientMessage(
      envelope('table.action', {
        tableId: 't1',
        handId: 'h1',
        actionSeq: 3,
        action: { type: 'raise', to: '300' },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ['malformed json', '{nope'],
    ['unknown type', envelope('table.explode', {})],
    ['wrong protocol version', JSON.stringify({ v: 2, id: 'x', type: 'ping', payload: {} })],
    ['missing id', JSON.stringify({ v: 1, type: 'ping', payload: {} })],
    ['negative chips', envelope('table.sit', { tableId: 't', seat: 0, buyIn: '-5' })],
    ['numeric chips', envelope('table.sit', { tableId: 't', seat: 0, buyIn: 500 })],
    ['seat out of range', envelope('table.sit', { tableId: 't', seat: 12, buyIn: '500' })],
    ['raise without amount', envelope('table.action', { tableId: 't', handId: 'h', actionSeq: 0, action: { type: 'raise' } })],
    ['oversized chips', envelope('table.sit', { tableId: 't', seat: 0, buyIn: '9'.repeat(30) })],
  ])('rejects %s', (_name, raw) => {
    expect(parseClientMessage(raw).ok).toBe(false);
  });
});

describe('server messages', () => {
  it('validates table events and the union of all server messages', () => {
    const event = {
      v: 1,
      type: 'cards.dealt',
      tableId: 't1',
      seq: 5,
      ts: 1,
      payload: { seat: 2, cards: ['As', 'Kd'] },
    };
    expect(tableEventSchema.safeParse(event).success).toBe(true);
    expect(serverMessageSchema.safeParse(event).success).toBe(true);
    expect(serverMessageSchema.safeParse({ ...event, payload: { seat: 2, cards: ['As', 'Xx'] } }).success).toBe(false);
  });

  it('allows a hidden cards.dealt for other seats', () => {
    const hidden = { v: 1, type: 'cards.dealt', tableId: 't1', seq: 5, ts: 1, payload: { seat: 3 } };
    expect(tableEventSchema.safeParse(hidden).success).toBe(true);
  });
});
