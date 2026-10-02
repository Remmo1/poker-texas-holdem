export class TokenBucket {
    capacity;
    refillPerSecond;
    now;
    tokens;
    lastRefill;
    constructor(capacity, refillPerSecond, now) {
        this.capacity = capacity;
        this.refillPerSecond = refillPerSecond;
        this.now = now;
        this.tokens = capacity;
        this.lastRefill = now();
    }
    take() {
        const current = this.now();
        this.tokens = Math.min(this.capacity, this.tokens + ((current - this.lastRefill) / 1000) * this.refillPerSecond);
        this.lastRefill = current;
        if (this.tokens < 1)
            return false;
        this.tokens -= 1;
        return true;
    }
}
//# sourceMappingURL=rate-limiter.js.map