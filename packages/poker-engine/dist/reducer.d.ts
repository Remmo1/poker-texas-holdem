import type { HandEvent, HandStarted } from './events.js';
import type { HandState } from './state.js';
export declare function createInitialState(event: HandStarted): HandState;
/** Pure reducer: every event fully determines its state change, so replaying events rebuilds the hand. */
export declare function applyEvent(state: HandState, event: HandEvent): HandState;
export declare function replay(events: readonly HandEvent[]): HandState;
