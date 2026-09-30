import { useStore } from 'zustand';
import { createApi } from './net/api';
import { GameController } from './net/controller';
import { createAppStore } from './state/store';
import type { AppState } from './state/store';

export const store = createAppStore();

export const controller = new GameController({
  api: createApi(),
  store,
  wsUrl: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
  // sessionStorage keeps the token per tab and clears it when the tab closes.
  storage: sessionStorage,
});

export function useApp<T>(selector: (state: AppState) => T): T {
  return useStore(store, selector);
}
