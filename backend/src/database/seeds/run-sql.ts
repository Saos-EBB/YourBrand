// Manual ops CLI, not called by any script or entrypoint — runs an arbitrary
// .sql file against the configured DB. Run with: npx ts-node -r
// tsconfig-paths/register src/database/seeds/run-sql.ts <path-to.sql>
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

const file = process.argv[2];
if (!file) { console.error('Usage: ts-node run-sql.ts <path-to.sql>'); process.exit(1); }

const ds = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: parseInt(process.env.DB_PORT ?? '5432'), database: process.env.DB_NAME ?? '', username: process.env.DB_USER ?? '', password: process.env.DB_PASSWORD ?? '', synchronize: false, logging: false });

ds.initialize().then(async () => {
    const sql = fs.readFileSync(path.resolve(file), 'utf8');
    await ds.query(sql);
    console.log('OK:', path.basename(file));
    await ds.destroy();
}).catch(e => { console.error('FEHLER:', e.message); process.exit(1); });
