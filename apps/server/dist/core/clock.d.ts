export interface TimerHandle {
    readonly id: unknown;
}
export interface Clock {
    now(): number;
    setTimeout(fn: () => void, ms: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}
export declare const CLOCK: unique symbol;
export declare const systemClock: Clock;
