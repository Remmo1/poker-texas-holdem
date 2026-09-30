import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import { CONFIG } from '../../config/tokens.js';
import { CLOCK } from '../../core/clock.js';
import type { Clock } from '../../core/clock.js';

export interface Identity {
  readonly userId: string;
  readonly username: string;
}

/** One-time, short-lived tickets that turn an HTTP login into a WebSocket session. */
@Injectable()
export class TicketService {
  private readonly tickets = new Map<string, Identity & { expiresAt: number }>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  issue(identity: Identity): string {
    this.evictExpired();
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(ticket, { ...identity, expiresAt: this.clock.now() + this.config.wsTicketTtlSeconds * 1000 });
    return ticket;
  }

  /** Returns the identity once; the ticket is consumed either way. */
  redeem(ticket: string): Identity | null {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt < this.clock.now()) return null;
    return { userId: entry.userId, username: entry.username };
  }

  private evictExpired(): void {
    const now = this.clock.now();
    for (const [ticket, entry] of this.tickets) if (entry.expiresAt < now) this.tickets.delete(ticket);
  }
}
