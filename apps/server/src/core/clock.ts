export interface TimerHandle {
  readonly id: unknown;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout(fn, ms) {
    return { id: setTimeout(fn, ms) };
  },
  clearTimeout(handle) {
    clearTimeout(handle.id as NodeJS.Timeout);
  },
};
