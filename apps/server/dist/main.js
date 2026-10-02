import { loadConfig } from './config/config.js';
import { createApp } from './bootstrap.js';
import { PgDb } from './infra/db/pg-db.js';
async function main() {
    const { port, databaseUrl, app: config } = loadConfig();
    const db = new PgDb(databaseUrl);
    const app = await createApp({ db, config });
    await app.listen(port);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=main.js.map