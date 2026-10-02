var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { CONFIG } from '../../config/tokens.js';
import { DB } from '../../infra/db/db.js';
import { WalletService } from '../wallet/wallet.service.js';
import { hashPassword, verifyPassword } from './password.js';
const UNIQUE_VIOLATION = '23505';
let AuthService = class AuthService {
    db;
    config;
    wallet;
    key;
    // Compared against when the user is unknown so login timing does not reveal which names exist.
    dummyHash = null;
    constructor(db, config, wallet) {
        this.db = db;
        this.config = config;
        this.wallet = wallet;
        this.key = new TextEncoder().encode(config.jwtSecret);
    }
    async register(username, password) {
        const passwordHash = await hashPassword(password);
        try {
            return await this.db.transaction(async (tx) => {
                const created = await tx.query(`INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id`, [username, passwordHash]);
                const userId = created.rows[0].id;
                await this.wallet.openUserAccount(tx, userId);
                if (this.config.welcomeBonus > 0n) {
                    await this.wallet.transfer(tx, {
                        kind: 'bonus',
                        from: { type: 'house' },
                        to: { type: 'user', id: userId },
                        amount: this.config.welcomeBonus,
                        idempotencyKey: `welcome:${userId}`,
                    });
                }
                return { userId, username };
            });
        }
        catch (error) {
            if (error.code === UNIQUE_VIOLATION)
                throw new ConflictException('Username is taken');
            throw error;
        }
    }
    async login(username, password) {
        const found = await this.db.query(`SELECT id, username, password_hash, status FROM users WHERE lower(username) = lower($1)`, [username]);
        const user = found.rows[0];
        const valid = await verifyPassword(password, user?.password_hash ?? (await this.getDummyHash()));
        if (!user || !valid || user.status !== 'active')
            throw new UnauthorizedException('Invalid credentials');
        const accessToken = await new SignJWT({ username: user.username })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(user.id)
            .setIssuedAt()
            .setExpirationTime(`${this.config.accessTokenTtlSeconds}s`)
            .sign(this.key);
        return { accessToken, expiresIn: this.config.accessTokenTtlSeconds };
    }
    async verifyAccessToken(token) {
        try {
            const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
            if (!payload.sub || typeof payload['username'] !== 'string')
                throw new Error('Malformed claims');
            return { userId: payload.sub, username: payload['username'] };
        }
        catch {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
    getDummyHash() {
        return (this.dummyHash ??= hashPassword('dummy-password-for-timing'));
    }
};
AuthService = __decorate([
    Injectable(),
    __param(0, Inject(DB)),
    __param(1, Inject(CONFIG)),
    __param(2, Inject(WalletService))
], AuthService);
export { AuthService };
//# sourceMappingURL=auth.service.js.map