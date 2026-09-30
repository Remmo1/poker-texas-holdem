export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  take(): boolean {
    const current = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((current - this.lastRefill) / 1000) * this.refillPerSecond);
    this.lastRefill = current;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
