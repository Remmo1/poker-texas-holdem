import type { Clock, TimerHandle } from '../../src/core/clock.js';

interface Timer {
  readonly id: number;
  readonly at: number;
  readonly fn: () => void;
}

/** Deterministic clock: timers fire only when the test advances time. */
export class ManualClock implements Clock {
  private time = 1_700_000_000_000;
  private nextId = 1;
  private timers: Timer[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const timer = { id: this.nextId++, at: this.time + ms, fn };
    this.timers.push(timer);
    return { id: timer.id };
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers = this.timers.filter((t) => t.id !== handle.id);
  }

  get pending(): number {
    return this.timers.length;
  }

  /** Moves time forward, firing due timers in order (including ones they schedule). */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t.id !== due.id);
      this.time = Math.max(this.time, due.at);
      due.fn();
    }
    this.time = target;
  }
}
