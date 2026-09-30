import type { ServerMessage, TableEvent, WireAction } from '@holdem/shared';
import { ApiError } from './api';
import type { Api } from './api';
import { verifyDeckCommit } from './fairness';
import { AuthExpiredError, CommandError, GameSocket } from './socket';
import type { ConnectionStatus, FatalReason, WebSocketLike } from './socket';
import { applyTableEvent, checkSequence, viewFromSnapshot } from './tableView';
import type { TableView } from './tableView';
import { initialState } from '../state/store';
import type { AppStore } from '../state/store';

export interface ControllerDeps {
  readonly api: Api;
  readonly store: AppStore;
  readonly wsUrl: string;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  readonly createSocket?: (url: string) => WebSocketLike;
}

const TOKEN_KEY = 'holdem.token';

/** Glue between the wire protocol and the UI store: owns the socket, the auth session and the current table view. */
export class GameController {
  private socket: GameSocket | null = null;
  private resuming = false;
  private noticeCounter = 0;

  constructor(private readonly deps: ControllerDeps) {}

  private get store(): AppStore {
    return this.deps.store;
  }

  serverNow(): number {
    return this.socket?.serverNow() ?? Date.now();
  }

  currentTableId(): string | null {
    return this.store.getState().tableId;
  }

  // -- session -------------------------------------------------------------

  async restoreSession(): Promise<void> {
    const token = this.deps.storage?.getItem(TOKEN_KEY);
    if (token) await this.startSession(token).catch(() => this.deps.storage?.removeItem(TOKEN_KEY));
  }

  async register(username: string, password: string): Promise<boolean> {
    try {
      await this.deps.api.register(username, password);
      return this.login(username, password);
    } catch (error) {
      this.notify('error', describe(error));
      return false;
    }
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const { accessToken } = await this.deps.api.login(username, password);
      await this.startSession(accessToken);
      this.deps.storage?.setItem(TOKEN_KEY, accessToken);
      return true;
    } catch (error) {
      this.notify('error', describe(error));
      return false;
    }
  }

  logout(notice?: string): void {
    this.socket?.stop();
    this.socket = null;
    this.deps.storage?.removeItem(TOKEN_KEY);
    this.store.setState({ ...initialState, ...(notice ? { notice: this.makeNotice('info', notice) } : {}) });
  }

  private async startSession(token: string): Promise<void> {
    const me = await this.deps.api.me(token);
    this.store.setState({ session: { userId: me.userId, username: me.username, token }, balance: me.balance });
  }

  // -- lobby ---------------------------------------------------------------

  async refreshTables(): Promise<void> {
    try {
      this.store.setState({ tables: await this.deps.api.tables() });
    } catch (error) {
      this.notify('error', describe(error));
    }
  }

  async refreshBalance(): Promise<void> {
    const session = this.store.getState().session;
    if (!session) return;
    try {
      this.store.setState({ balance: (await this.deps.api.me(session.token)).balance });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) this.logout('Your session expired. Please sign in again.');
    }
  }

  // -- table ---------------------------------------------------------------

  openTable(tableId: string): void {
    if (!this.store.getState().session) return;
    this.store.setState({ tableId, view: null });
    if (!this.socket) this.socket = this.createSocket();
    if (this.socket.isOpen) void this.join(tableId);
    else this.socket.start();
  }

  /** Back to the lobby. A seated player stands up first, so they are not left folding blind after blind. */
  async leaveTable(): Promise<void> {
    if (this.store.getState().view?.mySeat != null) await this.stand();
    this.closeTable();
  }

  closeTable(): void {
    const { tableId } = this.store.getState();
    if (tableId && this.socket?.isOpen) void this.socket.request('table.leave', { tableId }).catch(() => undefined);
    this.store.setState({ tableId: null, view: null });
  }

  async sit(seat: number, buyIn: bigint): Promise<boolean> {
    const ok = await this.command('table.sit', { seat, buyIn: buyIn.toString() });
    if (ok) void this.refreshBalance();
    return ok;
  }

  async stand(): Promise<boolean> {
    return this.command('table.stand', {});
  }

  async act(action: WireAction): Promise<boolean> {
    const { view } = this.store.getState();
    if (!view?.hand || view.mySeat === null || view.hand.toAct !== view.mySeat) return false;
    return this.command('table.action', { handId: view.hand.handId, actionSeq: view.hand.actionSeq, action });
  }

  private async command(type: string, extra: Record<string, unknown>): Promise<boolean> {
    const { tableId } = this.store.getState();
    if (!tableId || !this.socket) return false;
    try {
      await this.socket.request(type, { tableId, ...extra });
      return true;
    } catch (error) {
      this.notify('error', describe(error));
      return false;
    }
  }

  // -- socket --------------------------------------------------------------

  private createSocket(): GameSocket {
    return new GameSocket(
      {
        url: this.deps.wsUrl,
        getTicket: () => this.fetchTicket(),
        ...(this.deps.createSocket ? { createSocket: this.deps.createSocket } : {}),
      },
      {
        onReady: () => {
          const { tableId } = this.store.getState();
          if (tableId) void this.join(tableId);
        },
        onMessage: (message) => this.handleMessage(message),
        onStatus: (status, fatal) => this.handleStatus(status, fatal),
      },
    );
  }

  private async fetchTicket(): Promise<string> {
    const session = this.store.getState().session;
    if (!session) throw new AuthExpiredError();
    try {
      return await this.deps.api.wsTicket(session.token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new AuthExpiredError();
      throw error;
    }
  }

  private async join(tableId: string): Promise<void> {
    this.resuming = false;
    try {
      // The snapshot arrives as a message before this request is acknowledged.
      await this.socket?.request('table.join', { tableId });
    } catch (error) {
      this.notify('error', describe(error));
      if (error instanceof CommandError && error.code === 'TABLE_NOT_FOUND') this.closeTable();
    }
  }

  private handleStatus(status: ConnectionStatus, fatal?: FatalReason): void {
    this.store.setState({ connection: status });
    if (fatal === 'replaced') {
      this.socket = null;
      this.store.setState({ tableId: null, view: null, notice: this.makeNotice('error', 'You signed in from another window, so this one was disconnected.') });
    } else if (fatal === 'auth') {
      this.logout('Your session expired. Please sign in again.');
    }
  }

  private handleMessage(message: ServerMessage): void {
    const state = this.store.getState();
    const session = state.session;
    if (!session) return;

    if (message.type === 'cmd.reject') {
      this.notify('error', message.payload.message);
      return;
    }
    if (!('tableId' in message) || message.tableId !== state.tableId) return;

    if (message.type === 'table.snapshot') {
      this.resuming = false;
      const fresh = viewFromSnapshot(message.payload, message.seq);
      // A snapshot knows nothing about finished hands, so carry the last result over.
      const previous = state.view?.tableId === fresh.tableId ? state.view.lastResult : null;
      this.store.setState({ view: { ...fresh, lastResult: previous } });
      return;
    }

    const view = state.view;
    if (!view) return;
    const event = message as TableEvent;
    switch (checkSequence(view, event.seq)) {
      case 'duplicate':
        return;
      case 'gap':
        this.resume(view);
        return;
      case 'apply':
        this.applyEvent(view, event, session.userId);
    }
  }

  private applyEvent(view: TableView, event: TableEvent, userId: string): void {
    const next = applyTableEvent(view, event, userId);
    this.store.setState({ view: next });

    if (event.type === 'hand.ended' && next.hand?.fairness) void this.verifyFairness(next);
    const mine = 'userId' in event.payload && event.payload.userId === userId;
    if (mine && (event.type === 'player.left' || event.type === 'player.seated')) void this.refreshBalance();
  }

  /** Asks the server for what we missed; it answers with the events or a fresh snapshot. */
  private resume(view: TableView): void {
    if (this.resuming) return;
    this.resuming = true;
    this.socket
      ?.request('sync.resume', { tableId: view.tableId, lastSeq: view.seq })
      .then(
        () => undefined,
        (error) => this.notify('error', describe(error)),
      )
      .finally(() => {
        this.resuming = false;
      });
  }

  private async verifyFairness(view: TableView): Promise<void> {
    const hand = view.hand;
    if (!hand?.fairness) return;
    const ok = await verifyDeckCommit(hand.fairness.deck, hand.fairness.salt, hand.deckCommit);
    const current = this.store.getState().view;
    if (!current) return;
    const lastResult =
      current.lastResult?.handId === hand.handId ? { ...current.lastResult, fairnessVerified: ok } : current.lastResult;
    // The next hand may already have started by the time the check finishes.
    const currentHand = current.hand?.handId === hand.handId ? { ...current.hand, fairnessVerified: ok } : current.hand;
    this.store.setState({ view: { ...current, lastResult, hand: currentHand } });
    if (!ok) this.notify('error', 'The revealed deck does not match the commitment the server made before dealing.');
  }

  // -- notices -------------------------------------------------------------

  private makeNotice(kind: 'error' | 'info', text: string) {
    return { id: ++this.noticeCounter, kind, text };
  }

  private notify(kind: 'error' | 'info', text: string): void {
    this.store.setState({ notice: this.makeNotice(kind, text) });
  }

  dismissNotice(): void {
    this.store.setState({ notice: null });
  }
}

function describe(error: unknown): string {
  if (error instanceof CommandError && error.code === 'NOT_CONNECTED') return 'Not connected to the server. Reconnecting…';
  return error instanceof Error ? error.message : 'Something went wrong';
}
