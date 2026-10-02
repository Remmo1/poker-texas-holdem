var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
let AuthGuard = class AuthGuard {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const header = request.headers['authorization'];
        const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token)
            throw new UnauthorizedException('Missing bearer token');
        request.user = await this.auth.verifyAccessToken(token);
        return true;
    }
};
AuthGuard = __decorate([
    Injectable(),
    __param(0, Inject(AuthService))
], AuthGuard);
export { AuthGuard };
//# sourceMappingURL=auth.guard.js.map