import type { AppConfig } from '../../config/config.js';
import type { Db } from '../../infra/db/db.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { Identity } from './ticket.service.js';
export declare class AuthService {
    private readonly db;
    private readonly config;
    private readonly wallet;
    private readonly key;
    private dummyHash;
    constructor(db: Db, config: AppConfig, wallet: WalletService);
    register(username: string, password: string): Promise<Identity>;
    login(username: string, password: string): Promise<{
        accessToken: string;
        expiresIn: number;
    }>;
    verifyAccessToken(token: string): Promise<Identity>;
    private getDummyHash;
}
