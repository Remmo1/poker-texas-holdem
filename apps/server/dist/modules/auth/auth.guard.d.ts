import { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { Identity } from './ticket.service.js';
export interface AuthenticatedRequest {
    headers: Record<string, string | string[] | undefined>;
    user?: Identity;
}
export declare class AuthGuard implements CanActivate {
    private readonly auth;
    constructor(auth: AuthService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
