import { cardToString } from './cards.js';
import { maxChips, minChips } from './chips.js';
import { EngineError } from './errors.js';
import type { ActionKind, HandEvent, HandStarted } from './events.js';
import { evaluate } from './evaluator.js';
import { computePots } from './pots.js';
import { applyEvent, createInitialState } from './reducer.js';
import { getLegalActions, nextSeatToAct } from './rules.js';
import type { LegalActions } from './rules.js';
import { getSeat, liveSeats, seatsClockwiseAfter } from './state.js';
import type { HandState, Pot, SeatState, TableRules } from './state.js';
import type { Card, Chips, SeatIndex } from './types.js';

export interface PlayerEntry {
  readonly seat: SeatIndex;
  readonly playerId: string;
  readonly stack: Chips;
}

export interface StartHandInput {
  readonly handId: string;
  readonly rules: TableRules;
  /** Must be one of the participating seats. */
  readonly buttonSeat: SeatIndex;
  readonly players: readonly PlayerEntry[];
  /** Shuffled deck, dealt from index 0. Shuffle with a CSPRNG outside the engine's decision logic. */
  readonly deck: readonly Card[];
}

export type ActionCommand =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call' }
  | { readonly type: 'allin' }
  /** `to` is the total bet for the round ("raise to"), not the increment. */
  | { readonly type: 'bet'; readonly to: Chips }
  | { readonly type: 'raise'; readonly to: Chips };

export interface EngineResult {
  readonly state: HandState;
  readonly events: readonly HandEvent[];
}

interface Recorder {
  readonly state: HandState;
  readonly events: HandEvent[];
  emit(event: HandEvent): void;
}

function createRecorder(initial: HandState, events: HandEvent[] = []): Recorder {
  let state = initial;
  return {
    events,
    get state() {
      return state;
    },
    emit(event) {
      events.push(event);
      state = applyEvent(state, event);
    },
  };
}

const NEXT_STREET = {
  preflop: { street: 'flop', cards: 3 },
  flop: { street: 'turn', cards: 1 },
  turn: { street: 'river', cards: 1 },
} as const;

function validateStart(input: StartHandInput): void {
  const { players, rules, deck } = input;
  const fail = (message: string): never => {
    throw new EngineError('INVALID_SETUP', message);
  };

  if (players.length < 2) fail('At least two players are required');
  if (rules.smallBlind <= 0n || rules.bigBlind < rules.smallBlind) fail('Invalid blinds');
  if (new Set(players.map((p) => p.seat)).size !== players.length) fail('Duplicate seats');
  if (new Set(players.map((p) => p.playerId)).size !== players.length) fail('Duplicate players');
  if (players.some((p) => !Number.isInteger(p.seat) || p.seat < 0)) fail('Invalid seat index');
  if (players.some((p) => p.stack <= 0n)) fail('Every player needs a positive stack');
  if (!players.some((p) => p.seat === input.buttonSeat)) fail('Button must be on a participating seat');
  if (deck.length < players.length * 2 + 5) fail('Deck is too small');
  if (new Set(deck.map(cardToString)).size !== deck.length) fail('Deck contains duplicate cards');
}

function postBlind(rec: Recorder, seatIndex: SeatIndex, blind: 'small' | 'big'): void {
  const seat = getSeat(rec.state, seatIndex);
  const { rules, currentBet } = rec.state;
  const amount = minChips(seat.stack, blind === 'small' ? rules.smallBlind : rules.bigBlind);
  rec.emit({
    type: 'BlindPosted',
    seat: seatIndex,
    blind,
    amount,
    allIn: amount === seat.stack,
    // Others must always match the full big blind, even if the poster was short.
    currentBet: blind === 'big' ? rules.bigBlind : maxChips(currentBet, seat.bet + amount),
  });
}

function holeCardsOf(seat: SeatState): readonly [Card, Card] {
  if (!seat.holeCards) throw new EngineError('ILLEGAL_ACTION', `Seat ${seat.seat} has no hole cards`);
  return seat.holeCards;
}

/** Starts a hand: posts blinds, deals hole cards, and requests the first action. */
export function startHand(input: StartHandInput): EngineResult {
  validateStart(input);

  const players = [...input.players].sort((a, b) => a.seat - b.seat);
  const n = players.length;
  const buttonIndex = players.findIndex((p) => p.seat === input.buttonSeat);
  // Heads-up: the button posts the small blind.
  const smallBlind = n === 2 ? players[buttonIndex]! : players[(buttonIndex + 1) % n]!;
  const bigBlind = n === 2 ? players[(buttonIndex + 1) % n]! : players[(buttonIndex + 2) % n]!;

  const started: HandStarted = {
    type: 'HandStarted',
    handId: input.handId,
    rules: input.rules,
    buttonSeat: input.buttonSeat,
    smallBlindSeat: smallBlind.seat,
    bigBlindSeat: bigBlind.seat,
    players: players.map(({ seat, playerId, stack }) => ({ seat, playerId, stack })),
    deck: [...input.deck],
  };
  const rec = createRecorder(createInitialState(started), [started]);

  postBlind(rec, smallBlind.seat, 'small');
  postBlind(rec, bigBlind.seat, 'big');

  // Two rounds of one card each, starting with the small blind.
  const smallBlindIndex = players.indexOf(smallBlind);
  const dealOrder = [...players.slice(smallBlindIndex), ...players.slice(0, smallBlindIndex)];
  dealOrder.forEach((p, k) => {
    rec.emit({
      type: 'HoleCardsDealt',
      seat: p.seat,
      cards: [input.deck[k]!, input.deck[n + k]!],
    });
  });

  advance(rec, bigBlind.seat);
  return { state: rec.state, events: rec.events };
}

interface Resolution {
  readonly action: ActionKind;
  readonly amount: Chips;
  readonly allIn: boolean;
  readonly currentBet: Chips;
  readonly minRaise: Chips;
}

function resolveCall(state: HandState, seat: SeatState, legal: LegalActions): Resolution {
  if (!legal.canCall) throw new EngineError('ILLEGAL_ACTION', 'Nothing to call');
  return {
    action: 'call',
    amount: legal.toCall,
    allIn: legal.toCall === seat.stack,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
  };
}

function resolveRaise(
  state: HandState,
  seat: SeatState,
  legal: LegalActions,
  kind: 'bet' | 'raise',
  to: Chips,
): Resolution {
  if (!legal.raise) throw new EngineError('ILLEGAL_ACTION', 'Raising is not allowed here');
  if (legal.raise.kind !== kind) {
    throw new EngineError('ILLEGAL_ACTION', `Use "${legal.raise.kind}" instead of "${kind}"`);
  }
  if (typeof to !== 'bigint' || to < legal.raise.min || to > legal.raise.max) {
    throw new EngineError('INVALID_AMOUNT', `Amount must be between ${legal.raise.min} and ${legal.raise.max}`);
  }
  const increase = to - state.currentBet;
  // A short all-in raise moves the bet but does not change the minimum raise.
  const isFullRaise = increase >= state.minRaise;
  return {
    action: kind,
    amount: to - seat.bet,
    allIn: to === seat.bet + seat.stack,
    currentBet: to,
    minRaise: isFullRaise ? increase : state.minRaise,
  };
}

function resolve(state: HandState, seat: SeatState, legal: LegalActions, command: ActionCommand): Resolution {
  switch (command.type) {
    case 'fold':
      return { action: 'fold', amount: 0n, allIn: false, currentBet: state.currentBet, minRaise: state.minRaise };
    case 'check':
      if (!legal.canCheck) throw new EngineError('ILLEGAL_ACTION', 'Cannot check facing a bet');
      return { action: 'check', amount: 0n, allIn: false, currentBet: state.currentBet, minRaise: state.minRaise };
    case 'call':
      return resolveCall(state, seat, legal);
    case 'bet':
    case 'raise':
      return resolveRaise(state, seat, legal, command.type, command.to);
    case 'allin': {
      const total = seat.bet + seat.stack;
      if (total <= state.currentBet) return resolveCall(state, seat, legal);
      if (!legal.raise) throw new EngineError('ILLEGAL_ACTION', 'Raising is not allowed here');
      return resolveRaise(state, seat, legal, legal.raise.kind, total);
    }
  }
}

/** Validates and applies a player's action, then advances the hand as far as it can go. */
export function act(state: HandState, seatIndex: SeatIndex, command: ActionCommand): EngineResult {
  if (state.status === 'complete') throw new EngineError('HAND_COMPLETE', 'The hand is over');
  if (state.toAct !== seatIndex) throw new EngineError('NOT_YOUR_TURN', `It is not seat ${seatIndex}'s turn`);

  const seat = getSeat(state, seatIndex);
  const legal = getLegalActions(state)!;
  const { action, amount, allIn, currentBet, minRaise } = resolve(state, seat, legal, command);

  const rec = createRecorder(state);
  rec.emit({
    type: 'ActionApplied',
    seat: seatIndex,
    action,
    amount,
    betTotal: seat.bet + amount,
    allIn,
    currentBet,
    minRaise,
    actionSeq: state.actionSeq + 1,
  });
  advance(rec, seatIndex);
  return { state: rec.state, events: rec.events };
}

/** Moves the hand forward: next actor, next street (including all-in runouts), or settlement. */
function advance(rec: Recorder, from: SeatIndex): void {
  for (;;) {
    const state = rec.state;
    if (liveSeats(state).length === 1) return settle(rec, false);

    const next = nextSeatToAct(state, from);
    if (next !== null) {
      rec.emit({ type: 'ActionRequested', seat: next });
      return;
    }

    if (state.street !== 'preflop' && state.street !== 'flop' && state.street !== 'turn') {
      return settle(rec, true);
    }
    const { street, cards } = NEXT_STREET[state.street];
    rec.emit({ type: 'StreetAdvanced', street, cards: state.deck.slice(0, cards) });
    from = state.buttonSeat;
  }
}

function pickWinners(pot: Pot, scores: ReadonlyMap<SeatIndex, number>): SeatIndex[] {
  if (pot.eligible.length === 1) return [...pot.eligible];
  const best = Math.max(...pot.eligible.map((s) => scores.get(s)!));
  return pot.eligible.filter((s) => scores.get(s) === best);
}

/** Returns uncalled bets, forms pots, and awards them; the odd chip goes to the first winner left of the button. */
function settle(rec: Recorder, showdown: boolean): void {
  const { pots, refunds } = computePots(
    rec.state.seats.map((s) => ({ seat: s.seat, committed: s.totalCommitted, folded: s.status === 'folded' })),
  );
  for (const refund of refunds) rec.emit({ type: 'UncalledBetReturned', ...refund });

  const scores = new Map<SeatIndex, number>();
  if (showdown) {
    const reveals = liveSeats(rec.state).map((s) => {
      const cards = holeCardsOf(s);
      const { category, score } = evaluate([...cards, ...rec.state.board]);
      scores.set(s.seat, score);
      return { seat: s.seat, cards, category, score };
    });
    rec.emit({ type: 'ShowdownRevealed', reveals });
  }

  rec.emit({ type: 'PotsFormed', pots });

  pots.forEach((pot, potIndex) => {
    const winners = new Set(pickWinners(pot, scores));
    const ordered = seatsClockwiseAfter(rec.state, rec.state.buttonSeat)
      .map((s) => s.seat)
      .filter((seat) => winners.has(seat));
    const count = BigInt(ordered.length);
    const share = pot.amount / count;
    const remainder = Number(pot.amount % count);
    ordered.forEach((seat, i) => {
      const amount = share + (i < remainder ? 1n : 0n);
      if (amount > 0n) rec.emit({ type: 'PotAwarded', potIndex, seat, amount });
    });
  });

  rec.emit({ type: 'HandEnded' });
}
