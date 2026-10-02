import pg from 'pg';
function wrap(client) {
    return {
        async query(sql, params = []) {
            const result = await client.query(sql, params);
            return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        },
        async exec(sql) {
            await client.query(sql);
        },
    };
}
export class PgDb {
    pool;
    direct;
    constructor(connectionString) {
        this.pool = new pg.Pool({ connectionString });
        this.direct = wrap(this.pool);
    }
    query(sql, params) {
        return this.direct.query(sql, params);
    }
    exec(sql) {
        return this.direct.exec(sql);
    }
    async transaction(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(wrap(client));
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async close() {
        await this.pool.end();
    }
}
//# sourceMappingURL=pg-db.js.map