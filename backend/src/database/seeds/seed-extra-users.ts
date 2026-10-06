/**
 * Fake-User-Seed
 * Ausfuehren: SEED_USERS=50 npx ts-node -r tsconfig-paths/register src/database/seeds/seed-extra-users.ts
 *
 * Legt SEED_USERS zusaetzliche, zufaellig generierte User + Profile an
 * (on top der 45 kuratierten demo-users.yaml-User), als Datenvolumen fuer
 * die Coin/Cash/Media-Seeds. Nickname-Praefix "seed_user_" identifiziert
 * sie eindeutig.
 *
 * Idempotent: fehlt SEED_USERS gegenueber der bereits vorhandenen Anzahl,
 * werden nur die fehlenden ergaenzt. SEED_RESET=true loescht alle
 * seed_user_* User (inkl. abhaengiger payment_logs/subscriptions, der Rest
 * kaskadiert per FK) und baut sie neu auf.
 */

import 'dotenv/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { encryptField, hashEmail } from '../../common/crypto/crypto.helper';
import { createRng, randomInt, seedFromString, buildBulkInsert, chunk } from './seed-shared';
import { tenantInfra } from '../../common/tenant/tenant-infra.helper';

const ds = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: tenantInfra().database,
    username: process.env.DB_USER     ?? '',
    password: process.env.DB_PASSWORD ?? '',
    synchronize: false,
    logging: false,
    extra: { options: '-c client_encoding=UTF8' },
});

const SEED_USERS = parseInt(process.env.SEED_USERS ?? '0', 10);
const SEED_RESET = (process.env.SEED_RESET ?? 'false').toLowerCase() === 'true';

const NICK_PREFIX = 'seed_user_';
const PUBLIC_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

// Postgres caps a single statement at 65535 bound parameters. A user row
// uses 7 of those, a profile row 6 — 1000/batch (7000 / 6000 params) keeps
// a wide margin below that ceiling regardless of which table's insert is
// running, while still moving 100k users in ~100 round trips, not one per
// row.
const INSERT_BATCH_SIZE = 1000;

function pad(n: number): string {
    return String(n).padStart(4, '0');
}

async function main() {
    if (SEED_USERS <= 0) {
        console.log('seed-extra-users: SEED_USERS=0 — nichts zu tun');
        return;
    }

    await ds.initialize();
    console.log('seed-extra-users: verbunden mit DB', tenantInfra().database);

    if (SEED_RESET) {
        await ds.query(
            `DELETE FROM payment_logs WHERE user_id IN (
                SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE p.nickname LIKE $1
             )`,
            [`${NICK_PREFIX}%`],
        );
        await ds.query(
            `DELETE FROM subscriptions WHERE user_id IN (
                SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE p.nickname LIKE $1
             )`,
            [`${NICK_PREFIX}%`],
        );
        // DELETE ... RETURNING liefert bei TypeORM ein Tupel [rows, rowCount] zurueck
        // (anders als INSERT ... RETURNING, das die Rows direkt liefert) — daher hier
        // destrukturieren statt .length auf dem Query-Ergebnis selbst zu lesen.
        const [deletedRows] = await ds.query(
            `DELETE FROM users WHERE id IN (
                SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE p.nickname LIKE $1
             ) RETURNING id`,
            [`${NICK_PREFIX}%`],
        );
        console.log(`  RESET  ${deletedRows.length} seed_user_* geloescht (Coin/Media/Profile kaskadierten mit)`);
    }

    const existing = await ds.query(
        `SELECT COUNT(*)::int AS n FROM profiles WHERE nickname LIKE $1`,
        [`${NICK_PREFIX}%`],
    );
    const existingCount: number = existing[0].n;

    if (existingCount >= SEED_USERS) {
        console.log(`seed-extra-users: SKIP  ${existingCount} seed_user_* bereits vorhanden (Ziel ${SEED_USERS})`);
        await ds.destroy();
        return;
    }

    const passwordHash = await bcrypt.hash('SeedUser1234!', 12);

    const userRows: unknown[][] = [];
    const profileRows: unknown[][] = [];

    for (let i = existingCount + 1; i <= SEED_USERS; i++) {
        const nickname = `${NICK_PREFIX}${pad(i)}`;
        const rng = createRng(seedFromString(`${nickname}:extra-user`));
        const email = `${nickname}@seed.local`;
        const userId = crypto.randomUUID();

        let publicId = '';
        for (let c = 0; c < 6; c++) publicId += PUBLIC_ID_CHARS[Math.floor(rng() * PUBLIC_ID_CHARS.length)];

        // "heute minus ageYears Jahre" allein reicht nicht: faellt der zufaellige
        // Monat/Tag spaeter im Jahr als heute, ist die Person de facto noch ein
        // Jahr juenger und chk_profiles_birthdate_min_age (>=18) schlaegt fehl.
        // Zusaetzliche randomisierte Tage nach unten schliessen die Luecke sicher.
        const ageYears = randomInt(rng, 18, 65);
        const extraDays = randomInt(rng, 0, 364);
        const birthdate = new Date();
        birthdate.setFullYear(birthdate.getFullYear() - ageYears);
        birthdate.setDate(birthdate.getDate() - extraDays);

        userRows.push([
            userId, encryptField(email), hashEmail(email), passwordHash,
            'user', true, publicId,
        ]);
        profileRows.push([
            crypto.randomUUID(), userId, nickname, birthdate.toISOString().slice(0, 10), true, true,
        ]);
    }

    // users + profiles muessen atomar zusammen entstehen — sonst hinterlaesst
    // ein Fehler (z.B. eine verletzte CHECK-Constraint) User ohne Profil, die
    // der naechste Lauf per COUNT(*) FROM profiles nicht sieht und erneut mit
    // demselben (deterministischen) Nickname/Email anzulegen versucht, was an
    // uq_users_email_hash scheitert. Deshalb bleibt das EINE Transaktion ueber
    // alle Batches hinweg (ein Fehler mittendrin rollt komplett zurueck, statt
    // einen halb geseedeten Batch stehen zu lassen) — nur die einzelnen INSERTs
    // sind jetzt in INSERT_BATCH_SIZE-Haeppchen aufgeteilt, damit ein grosses
    // SEED_USERS nicht an Postgres' Parameter-Limit pro Statement scheitert.
    // Users komplett vor Profiles (FK-Reihenfolge), genau wie vorher.
    await ds.transaction(async manager => {
        for (const batch of chunk(userRows, INSERT_BATCH_SIZE)) {
            const users = buildBulkInsert(batch, 'NOW(), NOW(), NOW()');
            await manager.query(
                `INSERT INTO users
                    (id, email, email_search_hash, password_hash, role, is_verified, public_id,
                     email_verified_at, created_at, last_login)
                 VALUES
                    ${users.placeholders}`,
                users.params,
            );
        }

        for (const batch of chunk(profileRows, INSERT_BATCH_SIZE)) {
            const profiles = buildBulkInsert(batch, 'NOW()');
            await manager.query(
                `INSERT INTO profiles
                    (id, user_id, nickname, birthdate, is_published, onboarding_completed, updated_at)
                 VALUES
                    ${profiles.placeholders}`,
                profiles.params,
            );
        }
    });

    await ds.destroy();
    console.log(`seed-extra-users: ${profileRows.length} seed_user_* angelegt (${existingCount} bereits vorhanden).`);
}

main().catch(err => {
    console.error('seed-extra-users: Fehler:', err.message);
    process.exit(1);
});
