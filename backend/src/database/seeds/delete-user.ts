// Manual ops CLI, not called by any script or entrypoint — hard-deletes a
// user by nickname. Run with: npx ts-node -r tsconfig-paths/register
// src/database/seeds/delete-user.ts <nickname>
import 'dotenv/config';
import { DataSource } from 'typeorm';

const nickname = process.argv[2];
if (!nickname) { console.error('Usage: ts-node delete-user.ts <nickname>'); process.exit(1); }

const ds = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME     ?? '',
    username: process.env.DB_USER     ?? '',
    password: process.env.DB_PASSWORD ?? '',
    synchronize: false,
    logging: false,
});

ds.initialize().then(async () => {
    const r = await ds.query(
        `SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE p.nickname = $1`,
        [nickname],
    );
    if (!r.length) {
        console.log('nicht gefunden:', nickname);
    } else {
        await ds.query('DELETE FROM users WHERE id = $1', [r[0].id]);
        console.log('geloescht:', nickname, '→', r[0].id);
    }
    await ds.destroy();
}).catch(e => { console.error(e.message); process.exit(1); });
