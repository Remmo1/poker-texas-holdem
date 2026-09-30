import { randomUUID } from 'node:crypto';
import {
  EngineError,
  act as engineAct,
  applyEvent,
  cardToString,
  createInitialState,
  getLegalActions,
  startHand,
  totalPot,
} from '@holdem/poker-engine';
import type { ActionCommand, Card, EngineResult, HandState } from '@holdem/poker-engine';
import type { ErrorCode, TableEventBody, TableSnapshot, WireAction } from '@holdem/shared';
import type { Clock, TimerHandle } from '../../core/clock.js';
import { InsufficientFundsError } from '../wallet/wallet.service.js';
import { commitDeck } from './fairness.js';
import type { DeckSource } from './fairness.js';
import { projectHandEvent, toWireLegal } from './projection.js';
import type { Projected } from './projection.js';
import { toWireConfig } from './table-config.js';
import type { TableDefinition } from './table-config.js';
import type { HandEndRecord, SeatRecord, TableStore } from './table-store.js';

export class TableError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TableError';
  }
}

/** One published table event. `forSeat` replaces `public` for that seat's owner only. */
export interface Broadcast {
  readonly seq: number;
  readonly ts: number;
  readonly public: TableEventBody;
  readonly forSeat?: { readonly seat: number; readonly event: TableEventBody };
}

export function viewerEvent(broadcast: Broadcast, viewerSeat: number | null): TableEventBody {
  return broadcast.forSeat && broadcast.forSeat.seat === viewerSeat ? broadcast.forSeat.event : broadcast.public;
}

export interface TableActorDeps {
  readonly store: TableStore;
  readonly clock: Clock;
  readonly deckSource: DeckSource;
  readonly handStartDelayMs: number;
  publish(tableId: string, broadcast: Broadcast): void;
  onError(message: string, error: unknown): void;
}

interface Slot {
  readonly seat: number;
  readonly userId: string;
  readonly username: string;
  stack: bigint;
  /** Set when the player stands mid-hand; they are folded and removed when the hand ends. */
  pendingLeave: boolean;
  /** Turns in a row that ran out of time; reset by any action. */
  missedTurns: number;
}

interface HandMeta {
  readonly handId: string;
  readonly handNo: number;
  readonly deckCommit: string;
  readonly deck: readonly Card[];
  readonly salt: string;
  readonly startStacks: ReadonlyMap<number, bigint>;
}

interface ActiveHand extends HandMeta {
  state: HandState;
  nextEventSeq: number;
  deadline: number | null;
  timer: TimerHandle | null;
  autoFold: Set<number>;
}

const HISTORY_LIMIT = 1000;
/** A player who times out this many turns in a row is treated as gone: folded, then cashed out and unseated. */
const MAX_MISSED_TURNS = 2;

function toEngineCommand(action: WireAction): ActionCommand {
  return action.type === 'bet' || action.type === 'raise'
    ? { type: action.type, to: BigInt(action.to) }
    : { type: action.type };
}

function runEngine(run: () => EngineResult): EngineResult {
  try {
    return run();
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    switch (error.code) {
      case 'HAND_COMPLETE':
        throw new TableError('NO_ACTIVE_HAND', error.message);
      case 'INVALID_SETUP':
        throw new TableError('INTERNAL', error.message);
      default:
        throw new TableError(error.code, error.message);
    }
  }
}

/**
 * Owns one table. Every mutation runs through a single serial queue, so there are no races between
 * players, timers and hand transitions. State is committed only after it has been persisted.
 */
export class TableActor {
  private readonly slots = new Map<number, Slot>();
  private hand: ActiveHand | null = null;
  private seqCounter = 0;
  private history: Broadcast[] = [];
  private buttonSeat: number | null = null;
  private startTimer: TimerHandle | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private handCounter: number;

  constructor(
    readonly definition: TableDefinition,
    private readonly deps: TableActorDeps,
    restored: { seats: readonly SeatRecord[]; lastHandNo: number },
  ) {
    for (const s of restored.seats) {
      this.slots.set(s.seat, { seat: s.seat, userId: s.userId, username: s.username, stack: s.stack, pendingLeave: false, missedTurns: 0 });
    }
    this.handCounter = restored.lastHandNo;
  }

  get id(): string {
    return this.definition.id;
  }

  get seq(): number {
    return this.seqCounter;
  }

  get seatedCount(): number {
    return this.slots.size;
  }

  seatOf(userId: string): number | null {
    for (const slot of this.slots.values()) if (slot.userId === userId) return slot.seat;
    return null;
  }

  /** Resolves when every queued command has finished. */
  whenIdle(): Promise<void> {
    return this.tail.then(
      () => undefined,
      () => undefined,
    );
  }

  start(): void {
    this.scheduleHandStart();
  }

  dispose(): void {
    this.disposed = true;
    if (this.startTimer) this.deps.clock.clearTimeout(this.startTimer);
    if (this.hand?.timer) this.deps.clock.clearTimeout(this.hand.timer);
  }

  // -- commands ------------------------------------------------------------

  sit(user: { userId: string; username: string }, seat: number, buyIn: bigint): Promise<void> {
    return this.enqueue(async () => {
      const { config } = this.definition;
      if (seat >= config.maxSeats) throw new TableError('BAD_REQUEST', 'Seat does not exist');
      if (this.slots.has(seat)) throw new TableError('SEAT_TAKEN', 'Seat is taken');
      if (this.seatOf(user.userId) !== null) throw new TableError('ALREADY_SEATED', 'Already seated at this table');
      if (buyIn < config.minBuyIn || buyIn > config.maxBuyIn) {
        throw new TableError('INVALID_BUY_IN', `Buy-in must be between ${config.minBuyIn} and ${config.maxBuyIn}`);
      }

      try {
        await this.deps.store.sitPlayer({ tableId: this.id, seat, userId: user.userId, stack: buyIn });
      } catch (error) {
        if (error instanceof InsufficientFundsError) throw new TableError('INSUFFICIENT_FUNDS', error.message);
        throw error;
      }

      this.slots.set(seat, { seat, userId: user.userId, username: user.username, stack: buyIn, pendingLeave: false, missedTurns: 0 });
      this.publishAll([
        { public: { type: 'player.seated', payload: { seat, userId: user.userId, username: user.username, stack: buyIn.toString() } } },
      ]);
      this.scheduleHandStart();
    });
  }

  stand(userId: string): Promise<void> {
    return this.enqueue(async () => {
      const seat = this.seatOf(userId);
      if (seat === null) throw new TableError('NOT_SEATED', 'Not seated at this table');
      const slot = this.slots.get(seat)!;

      const hand = this.hand;
      if (hand?.state.seats.some((s) => s.seat === seat)) {
        slot.pendingLeave = true;
        hand.autoFold.add(seat);
        await this.drainAutoFold();
        return;
      }
      await this.removeSlot(slot);
    });
  }

  act(userId: string, message: { handId: string; actionSeq: number; action: WireAction }): Promise<void> {
    return this.enqueue(async () => {
      const seat = this.seatOf(userId);
      if (seat === null) throw new TableError('NOT_SEATED', 'Not seated at this table');
      const hand = this.hand;
      if (!hand || hand.handId !== message.handId) throw new TableError('NO_ACTIVE_HAND', 'That hand is not active');
      if (hand.state.toAct !== seat) throw new TableError('NOT_YOUR_TURN', 'It is not your turn');
      if (message.actionSeq !== hand.state.actionSeq) throw new TableError('STALE_SEQ', 'Action is out of date');

      const command = toEngineCommand(message.action);
      const result = runEngine(() => engineAct(hand.state, seat, command));
      this.slotOfSeat(seat).missedTurns = 0;
      await this.commitResult(result);
    });
  }

  // -- reads ---------------------------------------------------------------

  /** Everything the recipient may know: never another seat's hole cards or the deck. */
  snapshotFor(userId: string | null): TableSnapshot {
    const hand = this.hand;
    const viewerSeat = userId === null ? null : this.seatOf(userId);

    const seats = [...this.slots.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((slot) => {
        const inHand = hand?.state.seats.find((s) => s.seat === slot.seat);
        return {
          seat: slot.seat,
          userId: slot.userId,
          username: slot.username,
          stack: (inHand?.stack ?? slot.stack).toString(),
          status: inHand?.status ?? ('waiting' as const),
          bet: (inHand?.bet ?? 0n).toString(),
        };
      });

    const legal = hand ? getLegalActions(hand.state) : null;
    const own = viewerSeat === null ? undefined : hand?.state.seats.find((s) => s.seat === viewerSeat);

    return {
      tableId: this.id,
      name: this.definition.name,
      config: toWireConfig(this.definition.config),
      seats,
      hand: hand
        ? {
            handId: hand.handId,
            handNo: hand.handNo,
            deckCommit: hand.deckCommit,
            buttonSeat: hand.state.buttonSeat,
            smallBlindSeat: hand.state.smallBlindSeat,
            bigBlindSeat: hand.state.bigBlindSeat,
            street: hand.state.street,
            board: hand.state.board.map(cardToString),
            currentBet: hand.state.currentBet.toString(),
            minRaise: hand.state.minRaise.toString(),
            pot: totalPot(hand.state).toString(),
            toAct: hand.state.toAct,
            actionSeq: hand.state.actionSeq,
            deadline: hand.deadline,
            legal: legal ? toWireLegal(legal) : null,
          }
        : null,
      you:
        viewerSeat === null
          ? null
          : {
              seat: viewerSeat,
              holeCards: own?.holeCards ? [cardToString(own.holeCards[0]), cardToString(own.holeCards[1])] : null,
            },
    };
  }

  /** Events after `lastSeq`, or null when they are no longer buffered and a snapshot is needed. */
  eventsSince(lastSeq: number): Broadcast[] | null {
    if (lastSeq > this.seqCounter) return null;
    if (lastSeq === this.seqCounter) return [];
    const first = this.history[0];
    if (!first || first.seq > lastSeq + 1) return null;
    return this.history.filter((b) => b.seq > lastSeq);
  }

  // -- internals -----------------------------------------------------------

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private slotOfSeat(seat: number): Slot {
    const slot = this.slots.get(seat);
    if (!slot) throw new Error(`No player at seat ${seat}`);
    return slot;
  }

  private publishAll(items: readonly Projected[]): void {
    for (const item of items) {
      const broadcast: Broadcast = {
        seq: ++this.seqCounter,
        ts: this.deps.clock.now(),
        public: item.public,
        ...(item.forSeat ? { forSeat: item.forSeat } : {}),
      };
      this.history.push(broadcast);
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
      this.deps.publish(this.id, broadcast);
    }
  }

  private scheduleHandStart(): void {
    if (this.disposed || this.hand || this.startTimer || this.eligiblePlayers().length < 2) return;
    this.startTimer = this.deps.clock.setTimeout(() => {
      this.startTimer = null;
      this.enqueue(() => this.beginHand()).catch((error) => this.deps.onError(`Table ${this.id}: could not start hand`, error));
    }, this.deps.handStartDelayMs);
  }

  private eligiblePlayers(): Slot[] {
    return [...this.slots.values()].filter((s) => s.stack > 0n && !s.pendingLeave).sort((a, b) => a.seat - b.seat);
  }

  private nextButton(players: readonly Slot[]): number {
    const previous = this.buttonSeat;
    const next = previous === null ? players[0]! : (players.find((p) => p.seat > previous) ?? players[0]!);
    return next.seat;
  }

  private async beginHand(): Promise<void> {
    const players = this.eligiblePlayers();
    if (this.disposed || this.hand || players.length < 2) return;

    const { config } = this.definition;
    const { deck, salt } = this.deps.deckSource();
    const handId = randomUUID();
    const handNo = ++this.handCounter;
    const buttonSeat = this.nextButton(players);

    const result = startHand({
      handId,
      rules: { smallBlind: config.smallBlind, bigBlind: config.bigBlind },
      buttonSeat,
      players: players.map((p) => ({ seat: p.seat, playerId: p.userId, stack: p.stack })),
      deck,
    });
    this.buttonSeat = buttonSeat;

    await this.commitResult(result, {
      handId,
      handNo,
      deckCommit: commitDeck(deck, salt),
      deck,
      salt,
      startStacks: new Map(players.map((p) => [p.seat, p.stack])),
    });
  }

  private project(events: EngineResult['events'], from: HandState | null, meta: HandMeta, deadline: number | null): Projected[] {
    const userIdBySeat = new Map([...this.slots.values()].map((s) => [s.seat, s.userId]));
    const projected: Projected[] = [];
    let state = from;
    for (const event of events) {
      state = event.type === 'HandStarted' ? createInitialState(event) : applyEvent(state!, event);
      const item = projectHandEvent(event, {
        state,
        handNo: meta.handNo,
        deckCommit: meta.deckCommit,
        userIdBySeat,
        deadline,
        reveal: event.type === 'HandEnded' ? { deck: meta.deck, salt: meta.salt } : null,
      });
      if (item) projected.push(item);
    }
    return projected;
  }

  private buildEnd(state: HandState, meta: HandMeta): HandEndRecord {
    return {
      deck: meta.deck,
      salt: meta.salt,
      players: state.seats.map((s) => ({
        userId: this.slotOfSeat(s.seat).userId,
        endStack: s.stack,
        holeCards: s.holeCards ? s.holeCards.map(cardToString).join(' ') : null,
      })),
      seats: [...this.slots.values()].map((slot) => ({
        seat: slot.seat,
        stack: state.seats.find((s) => s.seat === slot.seat)?.stack ?? slot.stack,
      })),
    };
  }

  /** Persists a batch of engine events, then makes it visible: write-ahead, so clients never see unsaved state. */
  private async commitResult(result: EngineResult, start?: HandMeta): Promise<void> {
    const current = start ? null : this.hand!;
    const meta: HandMeta = start ?? current!;
    if (current?.timer) this.deps.clock.clearTimeout(current.timer);

    const complete = result.state.status === 'complete';
    const deadline = result.state.toAct !== null ? this.deps.clock.now() + this.definition.config.actionTimeMs : null;
    const projected = this.project(result.events, current?.state ?? null, meta, deadline);
    const end = complete ? this.buildEnd(result.state, meta) : undefined;

    try {
      if (start) {
        await this.deps.store.startHand({
          handId: meta.handId,
          tableId: this.id,
          handNo: meta.handNo,
          deckCommit: meta.deckCommit,
          players: result.state.seats.map((s) => ({
            userId: this.slotOfSeat(s.seat).userId,
            seat: s.seat,
            startStack: meta.startStacks.get(s.seat)!,
          })),
          events: result.events,
          ...(end ? { end } : {}),
        });
      } else {
        await this.deps.store.appendHandEvents({
          handId: meta.handId,
          tableId: this.id,
          fromSeq: current!.nextEventSeq,
          events: result.events,
          ...(end ? { end } : {}),
        });
      }
    } catch (error) {
      this.armTimer();
      throw error;
    }

    if (start) {
      this.hand = { ...meta, state: result.state, nextEventSeq: result.events.length, deadline, timer: null, autoFold: new Set() };
    } else {
      current!.state = result.state;
      current!.nextEventSeq += result.events.length;
      current!.deadline = deadline;
    }
    this.publishAll(projected);

    if (complete) {
      await this.finishHand(result.state);
    } else {
      await this.drainAutoFold();
      this.armTimer();
    }
  }

  private async drainAutoFold(): Promise<void> {
    const hand = this.hand;
    const seat = hand?.state.toAct;
    if (!hand || seat === null || seat === undefined || !hand.autoFold.has(seat)) return;
    await this.commitResult(runEngine(() => engineAct(hand.state, seat, { type: 'fold' })));
  }

  private armTimer(): void {
    const hand = this.hand;
    if (!hand || this.disposed) return;
    if (hand.timer) this.deps.clock.clearTimeout(hand.timer);
    hand.timer = null;

    const seat = hand.state.toAct;
    if (seat === null) return;
    const { handId } = hand;
    const actionSeq = hand.state.actionSeq;
    hand.timer = this.deps.clock.setTimeout(() => {
      this.enqueue(() => this.onTimeout(handId, actionSeq, seat)).catch((error) =>
        this.deps.onError(`Table ${this.id}: action timeout failed`, error),
      );
    }, this.definition.config.actionTimeMs);
  }

  private async onTimeout(handId: string, actionSeq: number, seat: number): Promise<void> {
    const hand = this.hand;
    if (!hand || hand.handId !== handId || hand.state.actionSeq !== actionSeq || hand.state.toAct !== seat) return;
    const legal = getLegalActions(hand.state)!;
    const command: ActionCommand = legal.canCheck ? { type: 'check' } : { type: 'fold' };

    const slot = this.slotOfSeat(seat);
    if (++slot.missedTurns >= MAX_MISSED_TURNS) {
      slot.pendingLeave = true;
      hand.autoFold.add(seat);
    }
    await this.commitResult(runEngine(() => engineAct(hand.state, seat, command)));
  }

  private async finishHand(finalState: HandState): Promise<void> {
    this.hand = null;
    for (const seatState of finalState.seats) this.slotOfSeat(seatState.seat).stack = seatState.stack;

    for (const slot of [...this.slots.values()]) {
      if (slot.pendingLeave || slot.stack === 0n) await this.removeSlot(slot);
    }
    this.scheduleHandStart();
  }

  private async removeSlot(slot: Slot): Promise<void> {
    await this.deps.store.standPlayer({ tableId: this.id, seat: slot.seat, userId: slot.userId, stack: slot.stack });
    this.slots.delete(slot.seat);
    this.publishAll([{ public: { type: 'player.left', payload: { seat: slot.seat, userId: slot.userId } } }]);
  }
}
