import pg from 'pg';
import type { Db, Queryable, QueryResult } from './db.js';

function wrap(client: pg.Pool | pg.PoolClient): Queryable {
  return {
    async query<R extends object>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
      const result = await client.query(sql, params as unknown[]);
      return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
    },
    async exec(sql: string): Promise<void> {
      await client.query(sql);
    },
  };
}

export class PgDb implements Db {
  private readonly pool: pg.Pool;
  private readonly direct: Queryable;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
    this.direct = wrap(this.pool);
  }

  query<R extends object>(sql: string, params?: readonly unknown[]): Promise<QueryResult<R>> {
    return this.direct.query<R>(sql, params);
  }

  exec(sql: string): Promise<void> {
    return this.direct.exec(sql);
  }

  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(wrap(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
