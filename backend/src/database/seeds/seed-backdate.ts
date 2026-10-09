/**
 * Laesst die Demo-Daten so aussehen, als liefe der Mandant schon
 * tenant.json "seedAgeDays" Tage. Ohne seedAgeDays oder mit LOADTEST_MODE: no-op.
 * Ausfuehren: npx ts-node -r tsconfig-paths/register src/database/seeds/seed-backdate.ts
 *
 * Laeuft als letzter Seed bei JEDEM Container-Start (docker-entrypoint.sh).
 * "Start" = NOW() - seedAgeDays, neu berechnet bei jedem Boot — der Mandant
 * wirkt also immer gleich alt, egal wann die Demo hochgefahren wird.
 *
 * Drei Gruppen:
 *
 * 1. Aktivitaet (Chats, Kontaktanfragen, Beefs, Reports …): die Seeds legen
 *    sie bewusst "vor X Minuten/Stunden" an. Liegt irgendetwas davon vor dem
 *    Start, wird ALLES in der Gruppe mit einem gemeinsamen Faktor Richtung
 *    NOW() gestaucht — so bleibt die Reihenfolge ueber Tabellen hinweg
 *    erhalten (Conversation vor ihren Nachrichten usw.).
 *
 * 2. users.created_at: deterministisch aus der User-ID verteilt zwischen
 *    Start und jetzt, mit mehr Anmeldungen gegen Ende (wachsende Plattform).
 *    Owner/Admins gibt es ab Tag 1. Nie spaeter als die erste Aktivitaet des
 *    Users aus Gruppe 1.
 *
 * 3. Historie pro User (Coins, Abos, Zahlungen, Media, Interessen, Consent):
 *    die Zusatz-Seeds streuen bis zu 2 Jahre zurueck. Was vor der Anmeldung
 *    des Users liegt, wird in [Anmeldung, jetzt] gestaucht (Reihenfolge pro
 *    Tabelle bleibt). Zahlungen danach nicht vor ihrem Abo-Start.
 *
 * Idempotent: Werte, die schon im Fenster liegen, bleiben unangetastet —
 * ein zweiter Lauf direkt danach aendert nichts.
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

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

// Gruppe 1: [Tabelle, Zeitspalten]. Nur Werte in der Vergangenheit werden
// gestaucht — ends_at/expires_at in der Zukunft bleiben, wie sie sind.
const ACTIVITY: [string, string[]][] = [
    ['conversations',    ['created_at', 'last_message_at']],
    ['messages',         ['sent_at', 'read_at']],
    ['contact_requests', ['created_at', 'responded_at']],
    ['matches',          ['created_at']],
    ['swipes',           ['swiped_at']],
    ['beefs',            ['created_at']],
    ['beef_comments',    ['created_at']],
    ['beef_votes',       ['created_at']],
    ['blocks',           ['created_at']],
    ['reports',          ['created_at', 'reviewed_at']],
    ['strikes',          ['created_at']],
    ['admin_tickets',    ['created_at', 'updated_at']],
    ['notifications',    ['created_at']],
];

// Fuer Gruppe 2: wo ein User in Gruppe 1 auftaucht [Tabelle, User-Spalte, Zeitspalte]
const ACTIVITY_OF_USER: [string, string, string][] = [
    ['conversations',    'user_a_id',    'created_at'],
    ['conversations',    'user_b_id',    'created_at'],
    ['messages',         'sender_id',    'sent_at'],
    ['contact_requests', 'sender_id',    'created_at'],
    ['contact_requests', 'receiver_id',  'created_at'],
    ['matches',          'user_a_id',    'created_at'],
    ['matches',          'user_b_id',    'created_at'],
    ['swipes',           'swiper_id',    'swiped_at'],
    ['beefs',            'initiator_id', 'created_at'],
    ['beefs',            'target_id',    'created_at'],
    ['beef_comments',    'user_id',      'created_at'],
    ['beef_votes',       'voter_id',     'created_at'],
    ['blocks',           'blocker_id',   'created_at'],
    ['reports',          'reporter_id',  'created_at'],
    ['admin_tickets',    'user_id',      'created_at'],
];

// Gruppe 3: [Tabelle, User-Spalte, Zeitspalte, Spalten die um dasselbe Delta mitwandern]
const HISTORY: [string, string, string, string[]][] = [
    ['user_interests',    'user_id',     'created_at',  []],
    ['consent_logs',      'user_id',     'accepted_at', ['withdrawn_at']],
    ['media_uploads',     'uploaded_by', 'uploaded_at', ['reviewed_at']],
    ['coin_transactions', 'user_id',     'created_at',  []],
    ['subscriptions',     'user_id',     'started_at',  ['expires_at', 'cancelled_at']],
];

// Stabiler Zufallswert 0..1 aus einer UUID (+ Salt), in SQL
const hash01 = (col: string, salt: string) =>
    `(('x' || substr(md5(${col}::text || '${salt}'), 1, 8))::bit(32)::bigint / 4294967296.0)`;

async function main() {
    if (process.env.LOADTEST_MODE === 'true') {
        console.log('seed-backdate: LOADTEST_MODE, Lastdaten bleiben wie sie sind');
        return;
    }
    const ageDays = loadTenantConfig().seedAgeDays;
    if (!ageDays) {
        console.log('seed-backdate: kein seedAgeDays in tenant.json, nichts zu tun');
        return;
    }
    await ds.initialize();

    await ds.transaction(async (tx) => {
        await tx.query(`CREATE TEMP TABLE bd_params ON COMMIT DROP AS
                        SELECT NOW() AS now, NOW() - make_interval(days => $1) AS launch`, [ageDays]);

        // ── Gruppe 1: gemeinsamer Stauchfaktor ────────────────────────────
        const oldest = ACTIVITY.flatMap(([table, cols]) =>
            cols.map((col) => `SELECT MIN(${col}) AS t FROM ${table}`)).join(' UNION ALL ');
        const [{ factor }] = await tx.query(
            `SELECT CASE WHEN o.t < p.launch
                         THEN EXTRACT(EPOCH FROM p.now - p.launch) / EXTRACT(EPOCH FROM p.now - o.t)
                         ELSE 1 END AS factor
             FROM (SELECT MIN(t) AS t FROM (${oldest}) x) o, bd_params p`,
        );
        if (Number(factor) < 1) {
            for (const [table, cols] of ACTIVITY) {
                const sets = cols.map((col) =>
                    `${col} = CASE WHEN ${col} < p.now THEN p.now - (p.now - ${col}) * ${Number(factor)} ELSE ${col} END`);
                await tx.query(`UPDATE ${table} SET ${sets.join(', ')} FROM bd_params p`);
            }
        }

        // Die Seeds legen alle Nachrichten in die letzten Stunden. Pro
        // Conversation von ihrem Start bis zur letzten Nachricht verteilen,
        // Reihenfolge bleibt, gegen Ende dichter. Die letzte Nachricht bleibt
        // wo sie ist — darum idempotent.
        await tx.query(
            `UPDATE messages m SET sent_at = x.new_t,
                                   read_at = CASE WHEN m.read_at IS NULL THEN NULL
                                                  ELSE LEAST(p.now, m.read_at + (x.new_t - m.sent_at)) END
             FROM bd_params p, (
               SELECT m.id, c.created_at + (l.last_t - c.created_at)
                        * power(ROW_NUMBER() OVER w / COUNT(*) OVER (PARTITION BY m.conversation_id)::float, 0.4) AS new_t
               FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               JOIN (SELECT conversation_id, MAX(sent_at) AS last_t FROM messages GROUP BY conversation_id) l
                 ON l.conversation_id = m.conversation_id
               WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.sent_at, m.id)) x
             WHERE m.id = x.id AND m.sent_at IS DISTINCT FROM x.new_t`,
        );

        // ── Gruppe 2: Anmeldedatum ────────────────────────────────────────
        // sqrt -> Dichte steigt linear zum heutigen Tag hin
        const firstActivity = ACTIVITY_OF_USER.map(([table, userCol, col]) =>
            `SELECT ${userCol} AS user_id, MIN(${col}) AS t FROM ${table} GROUP BY ${userCol}`).join(' UNION ALL ');
        await tx.query(`CREATE TEMP TABLE bd_first ON COMMIT DROP AS
                        SELECT user_id, MIN(t) AS t FROM (${firstActivity}) x GROUP BY user_id`);
        await tx.query(
            `UPDATE users u SET created_at = GREATEST(p.launch, LEAST(
                 CASE WHEN u.role IN ('owner', 'admin')
                      THEN p.launch + (p.now - p.launch) * 0.02 * ${hash01('u.id', 'created')}
                      ELSE p.launch + (p.now - p.launch) * sqrt(${hash01('u.id', 'created')})
                 END,
                 (SELECT f.t - interval '1 hour' FROM bd_first f WHERE f.user_id = u.id)))
             FROM bd_params p
             WHERE u.id != '${SYSTEM_USER}'`,
        );
        await tx.query(
            `UPDATE users u SET
                email_verified_at = CASE WHEN email_verified_at IS NULL THEN NULL
                                         ELSE created_at + interval '1 minute' * (1 + 30 * ${hash01('u.id', 'verified')}) END,
                last_login = GREATEST(last_login, created_at + interval '1 minute')
             WHERE u.id != '${SYSTEM_USER}'`,
        );

        // ── Gruppe 3: Historie in [Anmeldung, jetzt] ──────────────────────
        for (const [table, userCol, col, follow] of HISTORY) {
            await compressIntoUserWindow(tx, table, col, follow, `SELECT u.created_at FROM users u WHERE u.id = t.${userCol}`);
        }
        await compressIntoUserWindow(tx, 'payment_logs', 'created_at', [],
            `SELECT GREATEST(u.created_at, s.started_at) FROM users u
             LEFT JOIN subscriptions s ON s.id = t.subscription_id WHERE u.id = t.user_id`);

        // Die Zusatz-Seeds streuen Uhrzeiten gleichverteilt — nachts um 4 so
        // viel wie abends. Uhrzeit pro Zeile (Tag bleibt) deterministisch aus
        // der ID neu ziehen: Spitzen mittags und abends. Nur wenn das Ergebnis
        // im erlaubten Fenster liegt, sonst bleibt die alte Uhrzeit.
        for (const [table, userCol, col] of [['coin_transactions', 'user_id', 'created_at'], ['media_uploads', 'uploaded_by', 'uploaded_at']]) {
            const hour = `CASE WHEN ${hash01('t.id', 'peak')} < 0.65 THEN 20.5 ELSE 12.5 END
                          + 2.2 * sqrt(-2 * ln(GREATEST(${hash01('t.id', 'bm1')}, 1e-9))) * cos(2 * pi() * ${hash01('t.id', 'bm2')})`;
            await tx.query(
                `UPDATE ${table} t SET ${col} = x.new_t
                 FROM bd_params p, (
                   SELECT t.id, (date_trunc('day', t.${col} AT TIME ZONE 'Europe/Berlin')
                                 + make_interval(secs => ((${hour})::numeric % 24 + 24) % 24 * 3600)) AT TIME ZONE 'Europe/Berlin' AS new_t
                   FROM ${table} t) x, users u
                 WHERE x.id = t.id AND u.id = t.${userCol}
                   AND x.new_t BETWEEN u.created_at AND p.now AND x.new_t IS DISTINCT FROM t.${col}`,
            );
        }
    });

    const [range] = await ds.query(
        `SELECT to_char(MIN(created_at), 'YYYY-MM-DD') AS first, COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', NOW())) AS week,
                COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('day', NOW())) AS today
         FROM users WHERE id != '${SYSTEM_USER}'`,
    );
    console.log(`seed-backdate: Mandant laeuft seit ${ageDays} Tagen (erster User ${range.first}, ` +
        `${range.week} neue diese Woche, ${range.today} heute)`);
    await ds.destroy();
}

// Werte vor der Untergrenze (floorSql, pro Zeile) linear in [Untergrenze, jetzt]
// stauchen. Bezugspunkt ist der aelteste Wert der Tabelle, so bleibt die
// Reihenfolge pro User erhalten. follow-Spalten wandern um dasselbe Delta mit.
async function compressIntoUserWindow(
    tx: { query: (sql: string) => Promise<unknown> },
    table: string, col: string, follow: string[], floorSql: string,
) {
    const sets = [col, ...follow].map((c) => `${c} = ${c} + (f.new_t - t.${col})`);
    await tx.query(
        `UPDATE ${table} t SET ${sets.join(', ')}
         FROM (SELECT x.id, p.now - (p.now - x.${col}) * (EXTRACT(EPOCH FROM p.now - x.floor)
                                    / NULLIF(EXTRACT(EPOCH FROM p.now - o.oldest), 0)) AS new_t
               FROM (SELECT t.id, t.${col}, (${floorSql}) AS floor FROM ${table} t) x,
                    (SELECT MIN(${col}) AS oldest FROM ${table}) o, bd_params p
               WHERE x.${col} < x.floor) f
         WHERE t.id = f.id`,
    );
}

main().catch((err) => {
    console.error('seed-backdate: Fehler:', err.message);
    process.exit(1);
});
