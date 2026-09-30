import type { TableSummary } from '@holdem/shared';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { ConnectionStatus } from '../net/socket';
import type { TableView } from '../net/tableView';

export interface Session {
  readonly userId: string;
  readonly username: string;
  readonly token: string;
}

export interface Notice {
  readonly id: number;
  readonly kind: 'error' | 'info';
  readonly text: string;
}

export interface AppState {
  readonly session: Session | null;
  readonly balance: bigint | null;
  readonly connection: ConnectionStatus | 'idle';
  readonly tables: readonly TableSummary[];
  /** The table the user has opened; `view` is null until its snapshot arrives. */
  readonly tableId: string | null;
  readonly view: TableView | null;
  readonly notice: Notice | null;
}

export type AppStore = StoreApi<AppState>;

export const initialState: AppState = {
  session: null,
  balance: null,
  connection: 'idle',
  tables: [],
  tableId: null,
  view: null,
  notice: null,
};

export const createAppStore = (): AppStore => createStore<AppState>(() => initialState);
