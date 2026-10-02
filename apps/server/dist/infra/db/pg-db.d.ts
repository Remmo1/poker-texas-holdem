import type { Db, Queryable, QueryResult } from './db.js';
export declare class PgDb implements Db {
    private readonly pool;
    private readonly direct;
    constructor(connectionString: string);
    query<R extends object>(sql: string, params?: readonly unknown[]): Promise<QueryResult<R>>;
    exec(sql: string): Promise<void>;
    transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
