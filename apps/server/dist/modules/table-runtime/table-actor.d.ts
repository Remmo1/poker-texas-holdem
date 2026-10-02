import type { ErrorCode, TableEventBody, TableSnapshot, WireAction } from '@holdem/shared';
import type { Clock } from '../../core/clock.js';
import type { DeckSource } from './fairness.js';
import type { TableDefinition } from './table-config.js';
import type { SeatRecord, TableStore } from './table-store.js';
export declare class TableError extends Error {
    readonly code: ErrorCode;
    constructor(code: ErrorCode, message: string);
}
/** One published table event. `forSeat` replaces `public` for that seat's owner only. */
export interface Broadcast {
    readonly seq: number;
    readonly ts: number;
    readonly public: TableEventBody;
    readonly forSeat?: {
        readonly seat: number;
        readonly event: TableEventBody;
    };
}
export declare function viewerEvent(broadcast: Broadcast, viewerSeat: number | null): TableEventBody;
export interface TableActorDeps {
    readonly store: TableStore;
    readonly clock: Clock;
    readonly deckSource: DeckSource;
    readonly handStartDelayMs: number;
    publish(tableId: string, broadcast: Broadcast): void;
    onError(message: string, error: unknown): void;
}
/**
 * Owns one table. Every mutation runs through a single serial queue, so there are no races between
 * players, timers and hand transitions. State is committed only after it has been persisted.
 */
export declare class TableActor {
    readonly definition: TableDefinition;
    private readonly deps;
    private readonly slots;
    private hand;
    private seqCounter;
    private history;
    private buttonSeat;
    private startTimer;
    private tail;
    private disposed;
    private handCounter;
    constructor(definition: TableDefinition, deps: TableActorDeps, restored: {
        seats: readonly SeatRecord[];
        lastHandNo: number;
    });
    get id(): string;
    get seq(): number;
    get seatedCount(): number;
    seatOf(userId: string): number | null;
    /** Resolves when every queued command has finished. */
    whenIdle(): Promise<void>;
    start(): void;
    dispose(): void;
    sit(user: {
        userId: string;
        username: string;
    }, seat: number, buyIn: bigint): Promise<void>;
    stand(userId: string): Promise<void>;
    act(userId: string, message: {
        handId: string;
        actionSeq: number;
        action: WireAction;
    }): Promise<void>;
    /** Everything the recipient may know: never another seat's hole cards or the deck. */
    snapshotFor(userId: string | null): TableSnapshot;
    /** Events after `lastSeq`, or null when they are no longer buffered and a snapshot is needed. */
    eventsSince(lastSeq: number): Broadcast[] | null;
    private enqueue;
    private slotOfSeat;
    private publishAll;
    private scheduleHandStart;
    private eligiblePlayers;
    private nextButton;
    private beginHand;
    private project;
    private buildEnd;
    /** Persists a batch of engine events, then makes it visible: write-ahead, so clients never see unsaved state. */
    private commitResult;
    private drainAutoFold;
    private armTimer;
    private onTimeout;
    private finishHand;
    private removeSlot;
}
