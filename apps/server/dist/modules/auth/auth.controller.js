var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { loginRequestSchema, registerRequestSchema } from '@holdem/shared';
import { CONFIG } from '../../config/tokens.js';
import { WalletService } from '../wallet/wallet.service.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TicketService } from './ticket.service.js';
function parseBody(schema, body) {
    const parsed = schema.safeParse(body);
    if (!parsed.success)
        throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    return parsed.data;
}
let AuthController = class AuthController {
    auth;
    tickets;
    config;
    wallet;
    constructor(auth, tickets, config, wallet) {
        this.auth = auth;
        this.tickets = tickets;
        this.config = config;
        this.wallet = wallet;
    }
    async register(body) {
        const { username, password } = parseBody(registerRequestSchema, body);
        return this.auth.register(username, password);
    }
    async login(body) {
        const { username, password } = parseBody(loginRequestSchema, body);
        return this.auth.login(username, password);
    }
    async me(request) {
        const { userId, username } = request.user;
        const balance = await this.wallet.balanceOf({ type: 'user', id: userId });
        return { userId, username, balance: balance.toString() };
    }
    issueTicket(request) {
        const ticket = this.tickets.issue(request.user);
        return { ticket, expiresIn: this.config.wsTicketTtlSeconds };
    }
};
__decorate([
    Post('register'),
    __param(0, Body())
], AuthController.prototype, "register", null);
__decorate([
    Post('login'),
    HttpCode(200),
    __param(0, Body())
], AuthController.prototype, "login", null);
__decorate([
    Get('me'),
    UseGuards(AuthGuard),
    __param(0, Req())
], AuthController.prototype, "me", null);
__decorate([
    Post('ws-ticket'),
    HttpCode(200),
    UseGuards(AuthGuard),
    __param(0, Req())
], AuthController.prototype, "issueTicket", null);
AuthController = __decorate([
    Controller('auth'),
    __param(0, Inject(AuthService)),
    __param(1, Inject(TicketService)),
    __param(2, Inject(CONFIG)),
    __param(3, Inject(WalletService))
], AuthController);
export { AuthController };
//# sourceMappingURL=auth.controller.js.map