import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import type { AppConfig } from '../../config/config.js';
import { CONFIG } from '../../config/tokens.js';
import { DB } from '../../infra/db/db.js';
import type { Db } from '../../infra/db/db.js';
import { WalletService } from '../wallet/wallet.service.js';
import { hashPassword, verifyPassword } from './password.js';
import type { Identity } from './ticket.service.js';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class AuthService {
  private readonly key: Uint8Array;
  // Compared against when the user is unknown so login timing does not reveal which names exist.
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(WalletService) private readonly wallet: WalletService,
  ) {
    this.key = new TextEncoder().encode(config.jwtSecret);
  }

  async register(username: string, password: string): Promise<Identity> {
    const passwordHash = await hashPassword(password);
    try {
      return await this.db.transaction(async (tx) => {
        const created = await tx.query<{ id: string }>(
          `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id`,
          [username, passwordHash],
        );
        const userId = created.rows[0]!.id;
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
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new ConflictException('Username is taken');
      throw error;
    }
  }

  async login(username: string, password: string): Promise<{ accessToken: string; expiresIn: number }> {
    const found = await this.db.query<{ id: string; username: string; password_hash: string; status: string }>(
      `SELECT id, username, password_hash, status FROM users WHERE lower(username) = lower($1)`,
      [username],
    );
    const user = found.rows[0];
    const valid = await verifyPassword(password, user?.password_hash ?? (await this.getDummyHash()));
    if (!user || !valid || user.status !== 'active') throw new UnauthorizedException('Invalid credentials');

    const accessToken = await new SignJWT({ username: user.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlSeconds}s`)
      .sign(this.key);
    return { accessToken, expiresIn: this.config.accessTokenTtlSeconds };
  }

  async verifyAccessToken(token: string): Promise<Identity> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (!payload.sub || typeof payload['username'] !== 'string') throw new Error('Malformed claims');
      return { userId: payload.sub, username: payload['username'] };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private getDummyHash(): Promise<string> {
    return (this.dummyHash ??= hashPassword('dummy-password-for-timing'));
  }
}
