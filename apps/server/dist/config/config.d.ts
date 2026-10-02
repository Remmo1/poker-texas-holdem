export interface AppConfig {
    readonly jwtSecret: string;
    readonly accessTokenTtlSeconds: number;
    readonly wsTicketTtlSeconds: number;
    /** Chips granted from the house account when a user registers. */
    readonly welcomeBonus: bigint;
    readonly handStartDelayMs: number;
    /** How often the outbox relay polls; 0 disables the timer. */
    readonly outboxPollMs: number;
}
export declare function loadConfig(env?: NodeJS.ProcessEnv): {
    port: number;
    databaseUrl: string;
    app: AppConfig;
};
