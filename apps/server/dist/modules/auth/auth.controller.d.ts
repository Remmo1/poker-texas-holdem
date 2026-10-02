import type { AppConfig } from '../../config/config.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TicketService } from './ticket.service.js';
export declare class AuthController {
    private readonly auth;
    private readonly tickets;
    private readonly config;
    private readonly wallet;
    constructor(auth: AuthService, tickets: TicketService, config: AppConfig, wallet: WalletService);
    register(body: unknown): Promise<{
        userId: string;
        username: string;
    }>;
    login(body: unknown): Promise<{
        accessToken: string;
        expiresIn: number;
    }>;
    me(request: AuthenticatedRequest): Promise<{
        userId: string;
        username: string;
        balance: string;
    }>;
    issueTicket(request: AuthenticatedRequest): {
        ticket: string;
        expiresIn: number;
    };
}
