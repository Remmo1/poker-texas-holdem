import type { AppConfig } from '../../config/config.js';
import type { Clock } from '../../core/clock.js';
export interface Identity {
    readonly userId: string;
    readonly username: string;
}
/** One-time, short-lived tickets that turn an HTTP login into a WebSocket session. */
export declare class TicketService {
    private readonly config;
    private readonly clock;
    private readonly tickets;
    constructor(config: AppConfig, clock: Clock);
    issue(identity: Identity): string;
    /** Returns the identity once; the ticket is consumed either way. */
    redeem(ticket: string): Identity | null;
    private evictExpired;
}
