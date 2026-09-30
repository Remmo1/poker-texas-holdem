import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable, QueryResult } from '../../src/infra/db/db.js';

interface PgliteLike {
  query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[]; affectedRows?: number }>;
  exec(sql: string): Promise<unknown>;
}

function wrap(pg: PgliteLike): Queryable {
  return {
    async query<R extends object>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
      const result = await pg.query<R>(sql, params as unknown[]);
      // Match node-postgres: SELECTs report the number of rows returned.
      return { rows: result.rows, rowCount: result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0) };
    },
    async exec(sql: string): Promise<void> {
      await pg.exec(sql);
    },
  };
}

/** In-process Postgres so tests exercise real SQL without a server. */
export class PGliteDb implements Db {
  private readonly pg = new PGlite();
  private readonly direct = wrap(this.pg as unknown as PgliteLike);

  query<R extends object>(sql: string, params?: readonly unknown[]): Promise<QueryResult<R>> {
    return this.direct.query<R>(sql, params);
  }

  exec(sql: string): Promise<void> {
    return this.direct.exec(sql);
  }

  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.pg.transaction((tx) => work(wrap(tx as unknown as PgliteLike)));
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}
