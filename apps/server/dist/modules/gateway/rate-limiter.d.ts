export declare class TokenBucket {
    private readonly capacity;
    private readonly refillPerSecond;
    private readonly now;
    private tokens;
    private lastRefill;
    constructor(capacity: number, refillPerSecond: number, now: () => number);
    take(): boolean;
}
