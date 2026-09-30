import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  WS_TICKET_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  WELCOME_BONUS: z.coerce.bigint().min(0n).default(10_000n),
  HAND_START_DELAY_MS: z.coerce.number().int().min(0).default(3000),
});

export interface AppConfig {
  readonly jwtSecret: string;
  readonly accessTokenTtlSeconds: number;
  readonly wsTicketTtlSeconds: number;
  /** Chips granted from the house account when a user registers. */
  readonly welcomeBonus: bigint;
  readonly handStartDelayMs: number;
  /** How often the outbox relay polls; 0 disables the timer. */
  readonly outboxPollMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  databaseUrl: string;
  app: AppConfig;
} {
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
