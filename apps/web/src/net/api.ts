import { tableSummarySchema } from '@holdem/shared';
import type { TableSummary } from '@holdem/shared';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const loginResponse = z.object({ accessToken: z.string(), expiresIn: z.number() });
const meResponse = z.object({ userId: z.string(), username: z.string(), balance: z.string() });
const ticketResponse = z.object({ ticket: z.string() });

export interface Me {
  readonly userId: string;
  readonly username: string;
  readonly balance: bigint;
}

export interface Api {
  register(username: string, password: string): Promise<void>;
  login(username: string, password: string): Promise<{ accessToken: string; expiresIn: number }>;
  me(token: string): Promise<Me>;
  wsTicket(token: string): Promise<string>;
  tables(): Promise<TableSummary[]>;
}

async function call<S extends z.ZodType>(
  fetchImpl: typeof fetch,
  path: string,
  schema: S,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<z.infer<S>> {
  const response = await fetchImpl(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, describeError(body, response.status));
  return schema.parse(body);
}

function describeError(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' ? message : `Request failed (${status})`;
}

export function createApi(fetchImpl: typeof fetch = (...args) => fetch(...args)): Api {
  return {
    register: async (username, password) => {
      await call(fetchImpl, '/auth/register', z.object({}).passthrough(), { method: 'POST', body: { username, password } });
    },
    login: (username, password) => call(fetchImpl, '/auth/login', loginResponse, { method: 'POST', body: { username, password } }),
    me: async (token) => {
      const me = await call(fetchImpl, '/auth/me', meResponse, { token });
      return { userId: me.userId, username: me.username, balance: BigInt(me.balance) };
    },
    wsTicket: async (token) => (await call(fetchImpl, '/auth/ws-ticket', ticketResponse, { method: 'POST', body: {}, token })).ticket,
    tables: () => call(fetchImpl, '/tables', z.array(tableSummarySchema)),
  };
}
