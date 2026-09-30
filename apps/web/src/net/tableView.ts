import type { TableEvent, TableSnapshot, WireLegalActions } from '@holdem/shared';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type SeatStatus = 'waiting' | 'active' | 'folded' | 'allin';
export type HoleCards = readonly [string, string];

export interface SeatView {
  readonly seat: number;
  readonly userId: string;
  readonly username: string;
  readonly stack: bigint;
  readonly status: SeatStatus;
  /** Chips in front of the seat for the current betting round. */
  readonly bet: bigint;
  readonly hasCards: boolean;
}

export interface LegalView {
  readonly toCall: bigint;
  readonly canCheck: boolean;
  readonly canCall: boolean;
  readonly raise: { readonly kind: 'bet' | 'raise'; readonly min: bigint; readonly max: bigint } | null;
}

export interface HandView {
  readonly handId: string;
  readonly handNo: number;
  readonly deckCommit: string;
  readonly buttonSeat: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  readonly street: Street;
  readonly board: readonly string[];
  readonly currentBet: bigint;
  readonly minRaise: bigint;
  readonly pot: bigint;
  readonly toAct: number | null;
  readonly actionSeq: number;
  /** Server time in ms when the seat to act runs out of time. */
  readonly deadline: number | null;
  readonly legal: LegalView | null;
  readonly reveals: Readonly<Record<number, { cards: HoleCards; category: number }>>;
  readonly awards: readonly { seat: number; amount: bigint }[];
  readonly ended: boolean;
  /** Set once the hand ends; lets the player check the deck against `deckCommit`. */
  readonly fairness: { deck: readonly string[]; salt: string } | null;
  readonly fairnessVerified: boolean | null;
  /** Stacks when the hand began, to work out each player's net result; unknown if we joined mid-hand. */
  readonly startStacks: Readonly<Record<number, bigint>> | null;
}

export interface HandResultPlayer {
  readonly seat: number;
  readonly username: string;
  readonly outcome: 'won' | 'lost' | 'folded';
  /** Shown at showdown, or always for the viewer's own hand. */
  readonly cards: HoleCards | null;
  readonly category: number | null;
  readonly won: bigint;
  readonly net: bigint | null;
}

/** What the "last hand" dialog shows; kept after the next hand starts. */
export interface HandResult {
  readonly handId: string;
  readonly handNo: number;
  readonly board: readonly string[];
  readonly players: readonly HandResultPlayer[];
  readonly fairnessVerified: boolean | null;
}

export interface TableConfigView {
  readonly maxSeats: number;
  readonly smallBlind: bigint;
  readonly bigBlind: bigint;
  readonly minBuyIn: bigint;
  readonly maxBuyIn: bigint;
  readonly actionTimeMs: number;
}

export interface TableView {
  readonly tableId: string;
  readonly name: string;
  readonly config: TableConfigView;
  /** Seq of the last event this view reflects. */
  readonly seq: number;
  readonly seats: Readonly<Record<number, SeatView>>;
  readonly hand: HandView | null;
  readonly mySeat: number | null;
  readonly myCards: HoleCards | null;
  readonly lastResult: HandResult | null;
}

const chips = (value: string): bigint => BigInt(value);

const toLegal = (legal: WireLegalActions): LegalView => ({
  toCall: chips(legal.toCall),
  canCheck: legal.canCheck,
  canCall: legal.canCall,
  raise: legal.raise ? { kind: legal.raise.kind, min: chips(legal.raise.min), max: chips(legal.raise.max) } : null,
});

export function viewFromSnapshot(snapshot: TableSnapshot, seq: number): TableView {
  const seats: Record<number, SeatView> = {};
  for (const s of snapshot.seats) {
    seats[s.seat] = {
      seat: s.seat,
      userId: s.userId,
      username: s.username,
      stack: chips(s.stack),
      status: s.status,
      bet: chips(s.bet),
      hasCards: snapshot.hand !== null && s.status !== 'waiting',
    };
  }
  const h = snapshot.hand;
  return {
    tableId: snapshot.tableId,
    name: snapshot.name,
    config: {
      maxSeats: snapshot.config.maxSeats,
      smallBlind: chips(snapshot.config.smallBlind),
      bigBlind: chips(snapshot.config.bigBlind),
      minBuyIn: chips(snapshot.config.minBuyIn),
      maxBuyIn: chips(snapshot.config.maxBuyIn),
      actionTimeMs: snapshot.config.actionTimeMs,
    },
    seq,
    seats,
    hand: h && {
      handId: h.handId,
      handNo: h.handNo,
      deckCommit: h.deckCommit,
      buttonSeat: h.buttonSeat,
      smallBlindSeat: h.smallBlindSeat,
      bigBlindSeat: h.bigBlindSeat,
      street: h.street,
      board: h.board,
      currentBet: chips(h.currentBet),
      minRaise: chips(h.minRaise),
      pot: chips(h.pot),
      toAct: h.toAct,
      actionSeq: h.actionSeq,
      deadline: h.deadline,
      legal: h.legal && toLegal(h.legal),
      reveals: {},
      awards: [],
      ended: false,
      fairness: null,
      fairnessVerified: null,
      startStacks: null,
    },
    mySeat: snapshot.you?.seat ?? null,
    myCards: snapshot.you?.holeCards ?? null,
    lastResult: null,
  };
}

export type SequenceCheck = 'apply' | 'duplicate' | 'gap';

export function checkSequence(view: TableView, seq: number): SequenceCheck {
  if (seq <= view.seq) return 'duplicate';
  return seq === view.seq + 1 ? 'apply' : 'gap';
}

function updateSeat(view: TableView, seat: number, update: (s: SeatView) => SeatView): TableView {
  const current = view.seats[seat];
  return current ? { ...view, seats: { ...view.seats, [seat]: update(current) } } : view;
}

function updateHand(view: TableView, update: (h: HandView) => HandView): TableView {
  return view.hand ? { ...view, hand: update(view.hand) } : view;
}

/** Mirrors the server's engine bookkeeping from public events only; the caller must have checked the sequence. */
export function applyTableEvent(view: TableView, event: TableEvent, myUserId: string): TableView {
  return { ...reduce(view, event, myUserId), seq: event.seq };
}

function reduce(view: TableView, event: TableEvent, myUserId: string): TableView {
  switch (event.type) {
    case 'player.seated': {
      const p = event.payload;
      const seat: SeatView = {
        seat: p.seat,
        userId: p.userId,
        username: p.username,
        stack: chips(p.stack),
        status: 'waiting',
        bet: 0n,
        hasCards: false,
      };
      return { ...view, seats: { ...view.seats, [p.seat]: seat }, mySeat: p.userId === myUserId ? p.seat : view.mySeat };
    }

    case 'player.left': {
      const { [event.payload.seat]: _removed, ...seats } = view.seats;
      const mine = event.payload.userId === myUserId;
      return { ...view, seats, mySeat: mine ? null : view.mySeat, myCards: mine ? null : view.myCards };
    }

    case 'hand.started': {
      const p = event.payload;
      const inHand = new Map(p.players.map((pl) => [pl.seat, chips(pl.stack)]));
      const seats: Record<number, SeatView> = {};
      for (const s of Object.values(view.seats)) {
        const stack = inHand.get(s.seat);
        seats[s.seat] =
          stack === undefined
            ? { ...s, status: 'waiting', bet: 0n, hasCards: false }
            : { ...s, stack, status: 'active', bet: 0n, hasCards: false };
      }
      return {
        ...view,
        seats,
        myCards: null,
        hand: {
          handId: p.handId,
          handNo: p.handNo,
          deckCommit: p.deckCommit,
          buttonSeat: p.buttonSeat,
          smallBlindSeat: p.smallBlindSeat,
          bigBlindSeat: p.bigBlindSeat,
          street: 'preflop',
          board: [],
          currentBet: 0n,
          minRaise: view.config.bigBlind,
          pot: 0n,
          toAct: null,
          actionSeq: 0,
          deadline: null,
          legal: null,
          reveals: {},
          awards: [],
          ended: false,
          fairness: null,
          fairnessVerified: null,
          startStacks: Object.fromEntries(inHand),
        },
      };
    }

    case 'blind.posted': {
      const p = event.payload;
      const amount = chips(p.amount);
      const withSeat = updateSeat(view, p.seat, (s) => ({
        ...s,
        stack: s.stack - amount,
        bet: s.bet + amount,
        status: p.allIn ? 'allin' : s.status,
      }));
      const posted = withSeat.seats[p.seat]?.bet ?? amount;
      return updateHand(withSeat, (h) => ({
        ...h,
        pot: h.pot + amount,
        // Everyone must match the full big blind even if its poster was short.
        currentBet: p.blind === 'big' ? view.config.bigBlind : posted > h.currentBet ? posted : h.currentBet,
      }));
    }

    case 'cards.dealt': {
      const { seat, cards } = event.payload;
      const dealt = updateSeat(view, seat, (s) => ({ ...s, hasCards: true }));
      return cards && seat === view.mySeat ? { ...dealt, myCards: cards } : dealt;
    }

    case 'action.requested': {
      const p = event.payload;
      return updateHand(view, (h) => ({ ...h, toAct: p.seat, actionSeq: p.actionSeq, deadline: p.deadline, legal: toLegal(p.legal) }));
    }

    case 'action.applied': {
      const p = event.payload;
      const amount = chips(p.amount);
      const withSeat = updateSeat(view, p.seat, (s) => ({
        ...s,
        stack: s.stack - amount,
        bet: chips(p.betTotal),
        status: p.action === 'fold' ? 'folded' : p.allIn ? 'allin' : s.status,
      }));
      return updateHand(withSeat, (h) => ({
        ...h,
        pot: h.pot + amount,
        currentBet: chips(p.currentBet),
        minRaise: chips(p.minRaise),
        actionSeq: p.actionSeq,
        toAct: null,
        deadline: null,
        legal: null,
      }));
    }

    case 'street.advanced': {
      const seats = Object.fromEntries(Object.values(view.seats).map((s) => [s.seat, { ...s, bet: 0n }]));
      return updateHand({ ...view, seats }, (h) => ({
        ...h,
        street: event.payload.street,
        board: [...h.board, ...event.payload.cards],
        currentBet: 0n,
        minRaise: view.config.bigBlind,
        toAct: null,
        deadline: null,
        legal: null,
      }));
    }

    case 'uncalled.returned': {
      const amount = chips(event.payload.amount);
      const withSeat = updateSeat(view, event.payload.seat, (s) => ({ ...s, stack: s.stack + amount, bet: s.bet - amount }));
      return updateHand(withSeat, (h) => ({ ...h, pot: h.pot - amount }));
    }

    case 'showdown':
      return updateHand(view, (h) => ({
        ...h,
        street: 'showdown',
        toAct: null,
        deadline: null,
        legal: null,
        reveals: Object.fromEntries(event.payload.reveals.map((r) => [r.seat, { cards: r.cards, category: r.category }])),
      }));

    case 'pot.awarded': {
      const amount = chips(event.payload.amount);
      const withSeat = updateSeat(view, event.payload.seat, (s) => ({ ...s, stack: s.stack + amount }));
      return updateHand(withSeat, (h) => ({
        ...h,
        pot: h.pot > amount ? h.pot - amount : 0n,
        awards: [...h.awards, { seat: event.payload.seat, amount }],
      }));
    }

    case 'hand.ended': {
      const seats = Object.fromEntries(Object.values(view.seats).map((s) => [s.seat, { ...s, bet: 0n }]));
      const ended = updateHand({ ...view, seats }, (h) => ({
        ...h,
        ended: true,
        toAct: null,
        deadline: null,
        legal: null,
        fairness: { deck: event.payload.deck, salt: event.payload.salt },
      }));
      return { ...ended, lastResult: ended.hand ? summarizeHand(ended, ended.hand) : view.lastResult };
    }
  }
}

function summarizeHand(view: TableView, hand: HandView): HandResult {
  const players = Object.values(view.seats)
    .filter((s) => s.hasCards)
    .map((s): HandResultPlayer => {
      const won = hand.awards.filter((a) => a.seat === s.seat).reduce((sum, a) => sum + a.amount, 0n);
      const reveal = hand.reveals[s.seat];
      const start = hand.startStacks?.[s.seat];
      return {
        seat: s.seat,
        username: s.username,
        outcome: won > 0n ? 'won' : s.status === 'folded' ? 'folded' : 'lost',
        cards: reveal?.cards ?? (s.seat === view.mySeat ? view.myCards : null),
        category: reveal?.category ?? null,
        won,
        net: start === undefined ? null : s.stack - start,
      };
    })
    .sort((a, b) => Number(b.won - a.won) || a.seat - b.seat);
  return { handId: hand.handId, handNo: hand.handNo, board: hand.board, players, fairnessVerified: null };
}
