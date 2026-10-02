import { z } from 'zod';
const envSchema = z.object({
    PORT: z.coerce.number().int().min(0).default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    WS_TICKET_TTL_SECONDS: z.coerce.number().int().positive().default(30),
    WELCOME_BONUS: z.coerce.bigint().min(0n).default(10000n),
    HAND_START_DELAY_MS: z.coerce.number().int().min(0).default(3000),
});
export function loadConfig(env = process.env) {
    const parsed = envSchema.parse(env);
    return {
        port: parsed.PORT,
        databaseUrl: parsed.DATABASE_URL,
        app: {
            jwtSecret: parsed.JWT_SECRET,
            accessTokenTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
            wsTicketTtlSeconds: parsed.WS_TICKET_TTL_SECONDS,
            welcomeBonus: parsed.WELCOME_BONUS,
            handStartDelayMs: parsed.HAND_START_DELAY_MS,
            outboxPollMs: 250,
        },
    };
}
//# sourceMappingURL=config.js.map