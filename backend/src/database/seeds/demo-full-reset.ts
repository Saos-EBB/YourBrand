/**
 * Volles Reset auf den kuratierten Demo-Zustand.
 * Ausfuehren: npx ts-node -r tsconfig-paths/register src/database/seeds/demo-full-reset.ts
 *
 * Laeuft bei JEDEM Container-Start (docker-entrypoint.sh, als allererstes) —
 * loescht jeden User, dessen Profil-Nickname NICHT in demo-users.yaml steht,
 * inkl. Object-Storage-Dateien seiner Media-Uploads. Das trifft echte
 * Registrierungen genauso wie die von seed-extra-users.ts angelegten
 * seed_user_*-User. FK-Kaskaden (ON DELETE CASCADE auf users.id) raeumen
 * Profile, Media-Uploads, Nachrichten, Matches, Beefs, Coins etc. automatisch
 * mit weg. Fuenf Tabellen haben ON DELETE RESTRICT auf users.id und muessen
 * darum vorher explizit geleert werden: consent_logs, payment_logs,
 * subscriptions (in dieser Reihenfolge — payment_logs referenziert
 * subscriptions RESTRICT), organizations (owner_user_id), strikes
 * (issued_by).
 *
 * Warum eigenstaendig statt SEED_RESET zu erweitern: SEED_RESET (in
 * seed-extra-users/-media/-coin-transactions/-subscriptions-payments)
 * loescht nur, was diese Skripte selbst angelegt haben — nie echte
 * Registrierungen. Fuer eine oeffentliche Demo mit offener Registrierung
 * reicht das nicht: jeder Neustart soll wieder exakt der kuratierte
 * Ausgangszustand sein.
 *
 * Die kuratierten 45 Demo-User (demo-users.yaml) und der System-User
 * (00000000-0000-0000-0000-000000000000, siehe migrations/001_baseline.sql)
 * bleiben unberuehrt. Die YAML-eigenen "id"-Felder (z.B. "admin1") sind KEINE
 * DB-UUIDs — nur interne Referenz-Slugs innerhalb der Seed-Skripte. Die
 * echte Identitaet ist der Nickname (demo-seed.ts prueft Idempotenz darueber).
 *
 * Danach: repariert zusaetzlich file_url auf allen (auch kuratierten)
 * media_uploads-Zeilen, die noch nicht mit dem aktuellen S3_PUBLIC_URL_BASE
 * anfangen. demo-seed.ts ist idempotent und ueberspringt schon vorhandene
 * Nicknames komplett — es schreibt file_url also nie neu, egal wie oft der
 * Container neu startet. Aendert sich S3_PUBLIC_URL_BASE (z.B. neue
 * ngrok-Domain, oder Umstellung auf den Media-Proxy statt direkter
 * MinIO-URL), blieben die 45 kuratierten Fotos/Audios sonst dauerhaft auf der
 * alten, moeglicherweise unerreichbaren URL stehen.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DataSource } from 'typeorm';
import { deleteObject, keyFromPublicUrl } from '../../common/storage/object-storage.helper';

const ds = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME     ?? '',
    username: process.env.DB_USER     ?? '',
    password: process.env.DB_PASSWORD ?? '',
    synchronize: false,
    logging: false,
    extra: { options: '-c client_encoding=UTF8' },
});

interface SeedFile { users: { nickname: string }[] }

async function main() {
    await ds.initialize();
    console.log('demo-full-reset: verbunden mit DB', process.env.DB_NAME);

    const yamlPath = path.join(__dirname, 'demo-users.yaml');
    const seed = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as SeedFile;
    const curatedNicknames = seed.users.map((u) => u.nickname);

    // LEFT JOIN statt INNER JOIN: ein User ganz ohne Profil (sollte laut
    // auth.service.ts:register() nicht vorkommen) zaehlt hier defensiv auch
    // als "nicht kuratiert" und wird mitgeloescht.
    const toDelete: { id: string }[] = await ds.query(
        `SELECT u.id FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.id != '00000000-0000-0000-0000-000000000000'
           AND (p.nickname IS NULL OR p.nickname != ALL($1::text[]))`,
        [curatedNicknames],
    );
    const ids = toDelete.map((r) => r.id);

    if (ids.length === 0) {
        console.log('demo-full-reset: nichts zu tun, nur kuratierte User vorhanden');
    } else {
        const mediaRows: { file_url: string }[] = await ds.query(
            `SELECT file_url FROM media_uploads WHERE uploaded_by = ANY($1::uuid[])`,
            [ids],
        );

        // RESTRICT-Tabellen vorher leeren (Reihenfolge wegen
        // payment_logs_subscription_id_fkey RESTRICT auf subscriptions).
        await ds.query(`DELETE FROM consent_logs WHERE user_id = ANY($1::uuid[])`, [ids]);
        await ds.query(`DELETE FROM payment_logs WHERE user_id = ANY($1::uuid[])`, [ids]);
        await ds.query(`DELETE FROM subscriptions WHERE user_id = ANY($1::uuid[])`, [ids]);
        await ds.query(`DELETE FROM organizations WHERE owner_user_id = ANY($1::uuid[])`, [ids]);
        await ds.query(`DELETE FROM strikes WHERE issued_by = ANY($1::uuid[])`, [ids]);

        const [deletedUsers] = await ds.query(
            `DELETE FROM users WHERE id = ANY($1::uuid[]) RETURNING id`,
            [ids],
        );

        let deletedObjects = 0;
        for (const { file_url } of mediaRows) {
            const key = keyFromPublicUrl(file_url);
            if (!key) continue;
            try {
                await deleteObject(key);
                deletedObjects++;
            } catch (err) {
                console.error(`demo-full-reset: Objekt ${key} nicht loeschbar:`, (err as Error).message);
            }
        }

        console.log(
            `demo-full-reset: ${deletedUsers.length} nicht-kuratierte User geloescht ` +
            `(Profile/Nachrichten/Matches/Beefs/etc. kaskadierten mit), ` +
            `${deletedObjects}/${mediaRows.length} Objekte im Object Storage geloescht`,
        );
    }

    await repairStaleMediaUrls();
    await ds.destroy();
}

// demo-seed.ts schreibt file_url nur beim erstmaligen Anlegen — bereits
// vorhandene (kuratierte) User bekommen es nie neu, egal wie oft der
// Container startet. Holt jede Zeile, die nicht mit der aktuellen
// S3_PUBLIC_URL_BASE anfaengt, wieder auf den aktuellen Stand, indem der
// Storage-Key (immer "profiles/<file>" oder "audio/<file>", siehe
// media.service.ts/demo-seed.ts) aus der alten URL herausgeschnitten und mit
// der neuen Basis neu zusammengesetzt wird.
async function repairStaleMediaUrls() {
    const base = (process.env.S3_PUBLIC_URL_BASE ?? '').replace(/\/$/, '');
    if (!base) return;

    const stale: { id: string; file_url: string }[] = await ds.query(
        `SELECT id, file_url FROM media_uploads WHERE file_url NOT LIKE $1`,
        [`${base}/%`],
    );

    let fixed = 0;
    for (const row of stale) {
        const match = row.file_url.match(/(profiles|audio)\/[^/]+$/);
        if (!match) continue;
        await ds.query(`UPDATE media_uploads SET file_url = $1 WHERE id = $2`, [`${base}/${match[0]}`, row.id]);
        fixed++;
    }

    if (fixed > 0 || stale.length > 0) {
        console.log(`demo-full-reset: ${fixed}/${stale.length} veraltete media_uploads.file_url auf die aktuelle S3_PUBLIC_URL_BASE aktualisiert`);
    }
}

main().catch((err) => {
    console.error('demo-full-reset: Fehler:', err.message);
    process.exit(1);
});
