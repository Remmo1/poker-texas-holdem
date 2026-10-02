var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../../config/tokens.js';
import { CLOCK } from '../../core/clock.js';
/** One-time, short-lived tickets that turn an HTTP login into a WebSocket session. */
let TicketService = class TicketService {
    config;
    clock;
    tickets = new Map();
    constructor(config, clock) {
        this.config = config;
        this.clock = clock;
    }
    issue(identity) {
        this.evictExpired();
        const ticket = randomBytes(32).toString('base64url');
        this.tickets.set(ticket, { ...identity, expiresAt: this.clock.now() + this.config.wsTicketTtlSeconds * 1000 });
        return ticket;
    }
    /** Returns the identity once; the ticket is consumed either way. */
    redeem(ticket) {
        const entry = this.tickets.get(ticket);
        this.tickets.delete(ticket);
        if (!entry || entry.expiresAt < this.clock.now())
            return null;
        return { userId: entry.userId, username: entry.username };
    }
    evictExpired() {
        const now = this.clock.now();
        for (const [ticket, entry] of this.tickets)
            if (entry.expiresAt < now)
                this.tickets.delete(ticket);
    }
};
TicketService = __decorate([
    Injectable(),
    __param(0, Inject(CONFIG)),
    __param(1, Inject(CLOCK))
], TicketService);
export { TicketService };
//# sourceMappingURL=ticket.service.js.map