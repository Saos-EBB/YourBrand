/**
 * Demo-Daten fuer die Module board (Schwarzes Brett) und caretaker/orgs
 * (Betreuung, Organisation). No-op, wenn der Mandant die Module nicht an hat.
 * Ausfuehren: npx ts-node -r tsconfig-paths/register src/database/seeds/seed-board-care.ts
 *
 * Laeuft nach seed-backdate.ts (docker-entrypoint.sh), damit die Zeiten hier
 * relativ zu "jetzt" bleiben, aber nie vor der Anmeldung des Autors liegen.
 * Idempotent: legt nur an, was fehlt (Aushaenge per Titel, Betreuungen per
 * Paar, Organisation per Name).
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { loadTenantConfig } from '../../common/tenant/tenant-config.loader';
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

// [Autor, Art, Titel, Text, Strasse, Sichtbarkeit, vor Stunden, Abreisser, Meter vom Owner]
// Die Demo-User wohnen in verschiedenen Staedten. Damit das Brett im Demo-
// Login nach einem Kiez aussieht, haengen die Aushaenge rund um den Ort des
// Owners (gandalf) statt am Wohnort des Autors.
const POSTS: [string, string, string, string, string, string, number, string[], number][] = [
    ['tifa', 'search', 'Wer trägt Kisten mit?', 'Samstag ab 11 Uhr, zwei Umzugskisten in den 4. Stock, Hinterhaus. Kaffee und Kuchen gibt es.', 'Wrangelstraße', 'r500', 3, ['sid', 'robin', 'madi'], 120],
    ['sid', 'offer', 'Lastenrad zu verleihen', 'Am Wochenende frei. Schlüssel bei mir im Laden, einfach vorbeikommen.', 'Cuvrystraße', 'kiez', 7, ['hinata'], 650],
    ['gandalf', 'gift', 'Kinderfahrrad 16 Zoll', 'Steht im Hof, Klingel funktioniert. Wer zuerst kommt.', 'Wrangelstraße', 'public', 11, ['tifa'], 0],
    ['robin', 'meet', 'Hoffest am 18.10.', 'Jede Wohnung bringt was mit. Grill steht, Bänke brauchen wir noch.', 'Falckensteinstraße', 'public', 16, [], 380],
    ['hinata', 'offer', 'Nachhilfe Mathe, 7. Klasse', 'Zweimal die Woche nachmittags, ich studiere Lehramt.', 'Falckensteinstraße', 'r1000', 20, ['madi'], 820],
    ['madi', 'search', 'Suche Bohrmaschine', 'Nur für Samstag, bringe sie Sonntag zurück.', 'Wrangelstraße', 'street', 26, [], 90],
    ['makima', 'gift', 'Zimmerpflanzen abzugeben', 'Monstera und zwei Efeututen, ziehe um und kann sie nicht mitnehmen.', 'Schlesische Straße', 'public', 30, ['sid', 'tifa'], 1400],
];

async function userId(nickname: string): Promise<string | null> {
    const [row] = await ds.query('SELECT user_id FROM profiles WHERE nickname = $1', [nickname]);
    return row?.user_id ?? null;
}

async function seedBoard(): Promise<void> {
    const center = await userId('gandalf');
    let created = 0;
    for (const [i, [author, kind, title, body, street, visibility, hoursAgo, tearers, meters]] of POSTS.entries()) {
        const authorId = await userId(author);
        if (!authorId || !center) continue;
        // Ort: Owner-Ort plus Abstand in einer festen Richtung pro Aushang
        const location = `(SELECT CASE WHEN location IS NULL THEN NULL
                                ELSE ST_Project(location, ${meters}, radians(${(i * 53) % 360}))::geography END
                             FROM profiles WHERE user_id = '${center}')`;
        const [exists] = await ds.query('SELECT id FROM board_posts WHERE author_id = $1 AND title = $2', [authorId, title]);
        if (exists) {
            await ds.query(`UPDATE board_posts SET location = ${location} WHERE id = $1`, [exists.id]);
            continue;
        }

        const [post] = await ds.query(
            `INSERT INTO board_posts (author_id, kind, title, body, street, visibility, location, created_at, expires_at)
             SELECT $1, $2, $3, $4, $5, $6, ${location}, t.at, t.at + interval '14 days'
               FROM users u
              CROSS JOIN LATERAL (SELECT GREATEST(now() - make_interval(hours => $7), u.created_at + interval '10 minutes') AS at) t
              WHERE u.id = $1
             RETURNING id, created_at`,
            [authorId, kind, title, body, street, visibility, hoursAgo],
        );
        if (visibility === 'public') {
            await ds.query('INSERT INTO board_public_consents (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [authorId]);
        }
        for (const [i, tearer] of tearers.entries()) {
            const tearerId = await userId(tearer);
            if (!tearerId || tearerId === authorId) continue;
            const at = `GREATEST($3::timestamptz + make_interval(mins => ${20 + i * 35}), (SELECT created_at FROM users WHERE id = $1) + interval '5 minutes')`;
            const [cr] = await ds.query(
                `INSERT INTO contact_requests (sender_id, receiver_id, message_preview, created_at)
                 VALUES ($1, $2, $4, LEAST(${at}, now())) RETURNING id`,
                [tearerId, authorId, post.created_at, `Zettel: ${title}`],
            );
            await ds.query(
                'INSERT INTO board_tears (post_id, user_id, contact_request_id, created_at) VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING',
                [post.id, tearerId, cr.id],
            );
        }
        created++;
    }
    console.log(`seed-board-care: ${created} Aushänge angelegt`);
}

async function seedCare(withOrgs: boolean): Promise<void> {
    const owner = await userId('gandalf');
    const helper = await userId('tifa');
    if (!owner || !helper) return;

    let orgId: string | null = null;
    if (withOrgs) {
        const name = 'Wohnverbund Rheinblick';
        const [org] = await ds.query('SELECT id FROM organizations WHERE name = $1 AND deleted_at IS NULL', [name]);
        orgId = org?.id ?? (await ds.query(
            `INSERT INTO organizations (owner_user_id, name, description, is_verified)
             VALUES ($1, $2, 'Ambulant betreutes Wohnen in Köln-Ehrenfeld und Nippes.', true) RETURNING id`,
            [owner, name],
        ))[0].id;
        await ds.query(
            `INSERT INTO org_members (org_id, user_id, role, is_verified) VALUES ($1, $2, 'admin', true), ($1, $3, 'member', true)
             ON CONFLICT (org_id, user_id) DO NOTHING`,
            [orgId, owner, helper],
        );
    }

    // [Betreuung, Person, lesen, Schutz, angenommen, Ablauf in Tagen, Schutz-Markierung]
    const CARE: [string, string, boolean, boolean, boolean, number | null, boolean][] = [
        [owner, 'madi', true, true, true, 170, true],
        [owner, 'hinata', true, true, true, 95, false],
        [owner, 'robin', false, true, true, 8, false],
        [helper, 'makima', true, true, true, 260, true],
        [helper, 'power', false, true, false, null, false],
    ];
    for (const [caretaker, nickname, read, protect, accepted, days, vulnerable] of CARE) {
        const client = await userId(nickname);
        if (!client) continue;
        await ds.query(
            `INSERT INTO managed_accounts (user_id, caretaker_id, can_read_chat, can_write_chat, can_set_protection,
                                           created_at, accepted_at, expires_at, org_id)
             VALUES ($1, $2, $3, false, $4, now() - interval '2 days', CASE WHEN $5 THEN now() - interval '1 day' END,
                     CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END, $7)
             ON CONFLICT ON CONSTRAINT uq_managed_user_caretaker DO NOTHING`,
            [client, caretaker, read, protect, accepted, days, orgId],
        );
        if (vulnerable) await ds.query('UPDATE users SET vulnerable_flag = true WHERE id = $1 AND NOT vulnerable_flag', [client]);
    }

    // Eine Anfrage an madi, die sie schon angenommen hat und die auf die
    // Freigabe der Betreuung wartet
    const sender = await userId('sid');
    const madi = await userId('madi');
    if (sender && madi) {
        // Einmal pro Paar, egal mit welchem Status — sonst legte jeder Neustart
        // nach einer Freigabe wieder eine neue offene Anfrage an
        const [open] = await ds.query(
            'SELECT 1 FROM contact_requests WHERE sender_id = $1 AND receiver_id = $2',
            [sender, madi],
        );
        if (!open) {
            await ds.query(
                `INSERT INTO contact_requests (sender_id, receiver_id, message_preview, created_at, receiver_accepted_at, caretaker_status)
                 VALUES ($1, $2, 'Hallo, ich mag auch Musik. Wollen wir schreiben?', now() - interval '3 hours', now() - interval '2 hours', 'pending')`,
                [sender, madi],
            );
        }
    }
    console.log(`seed-board-care: Betreuung${withOrgs ? ' und Organisation' : ''} angelegt`);
}

async function main(): Promise<void> {
    if (process.env.LOADTEST_MODE === 'true') return;
    const { modules } = loadTenantConfig();
    if (!modules.board && !modules.caretaker) return;
    await ds.initialize();
    try {
        if (modules.board) await seedBoard();
        if (modules.caretaker) await seedCare(modules.orgs);
    } finally {
        await ds.destroy();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
