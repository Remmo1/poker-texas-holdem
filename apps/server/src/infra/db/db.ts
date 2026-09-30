export interface QueryResult<R> {
  rows: R[];
  rowCount: number;
}

export interface Queryable {
  query<R extends object = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<R>>;
  /** Runs several statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const DB = Symbol('DB');

/** bigint columns are read as text and converted here. */
export const toChips = (value: unknown): bigint => BigInt(value as string | number | bigint);
