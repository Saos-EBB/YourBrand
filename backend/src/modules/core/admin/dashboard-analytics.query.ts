// Zeitreihen + Verteilungen fuer die Analytics-Ansicht im Owner-Dashboard und
// in der Mandanten-Console. Plain function wie dashboard-stats.query.ts: der
// AdminService ruft sie mit seiner DataSource auf, die Console mit einem
// pg-Client pro Mandanten-DB.
export type RowsFn = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export interface AnalyticsKpi { current: number; previous: number }

export interface DashboardAnalytics {
    range: { days: AnalyticsRange; bucket: 'hour' | 'day'; from: string; to: string; launchedAt: string | null };
    buckets: string[];
    // eine Zahl pro Bucket, gleiche Laenge wie buckets
    series: {
        signups: number[];
        messages: number[];
        contactRequests: number[];
        coins: number[];
        uploads: number[];
        revenue: number[];
    };
    // User vor dem ersten Bucket, fuer die kumulierte Wachstumskurve
    usersBefore: number;
    // Zeitraum vs. gleich langer Zeitraum davor
    kpis: { signups: AnalyticsKpi; activity: AnalyticsKpi; revenue: AnalyticsKpi; activeSubscriptions: AnalyticsKpi };
    funnel: { key: 'registered' | 'verified' | 'photo' | 'contacted' | 'conversation' | 'premium'; count: number }[];
    // [Wochentag 0 = Mo][Stunde 0..23], alle Aktivitaeten im Zeitraum
    heatmap: number[][];
    plans: { plan: 'monthly' | 'yearly' | 'lifetime'; count: number }[];
    topInterests: { name: string; count: number }[];
    topCities: { name: string; count: number }[];
}

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
const TZ = 'Europe/Berlin';

// Alle "Aktivitaeten" als (Zeitpunkt, Art) — Basis fuer Aktivitaets-Spalten
// und Heatmap. Coins nur mit Hidden Zone, sonst zaehlen Seed-Coins mit, die
// der Mandant gar nicht anzeigt.
const eventsSql = (coins: boolean) => `
    SELECT sent_at AS t, 'messages' AS kind FROM messages
    UNION ALL SELECT created_at, 'contactRequests' FROM contact_requests
    UNION ALL SELECT uploaded_at, 'uploads' FROM media_uploads
    ${coins ? `UNION ALL SELECT created_at, 'coins' FROM coin_transactions` : ''}`;

export function parseAnalyticsRange(raw: unknown): AnalyticsRange {
    const n = Number(raw);
    return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 30;
}

export async function collectDashboardAnalytics(
    rows: RowsFn, days: AnalyticsRange, opts: { coins: boolean },
): Promise<DashboardAnalytics> {
    const EVENTS = eventsSql(opts.coins);
    // Zeitraum: letzte N Tage, aber nicht vor dem ersten User (sonst leere
    // Wochen links). Bis 4 Tage Spanne stundenweise, sonst taeglich.
    const [win] = await rows(
        `SELECT MIN(created_at) AS launched,
                GREATEST(NOW() - make_interval(days => $1), COALESCE(MIN(created_at), NOW())) AS from_t,
                NOW() AS to_t
         FROM users WHERE id != '${SYSTEM_USER}' AND deleted_at IS NULL`,
        [days],
    );
    const from = new Date(win.from_t as string);
    const to = new Date(win.to_t as string);
    const bucket: 'hour' | 'day' = to.getTime() - from.getTime() <= 4 * 86400000 ? 'hour' : 'day';
    const step = bucket === 'hour' ? '1 hour' : '1 day';
    const params = [from.toISOString(), to.toISOString()];

    // Buckets in Berliner Zeit, damit "Tag" dem Kalendertag entspricht
    const bucketsSql = `SELECT generate_series(date_trunc('${bucket}', $1::timestamptz AT TIME ZONE '${TZ}'),
                                               date_trunc('${bucket}', $2::timestamptz AT TIME ZONE '${TZ}'),
                                               interval '${step}') AS b`;
    const perBucket = (source: string, valueSql = 'COUNT(*)') => rows(
        `SELECT b.b AS b, COALESCE(x.v, 0) AS v
         FROM (${bucketsSql}) b
         LEFT JOIN (SELECT date_trunc('${bucket}', t AT TIME ZONE '${TZ}') AS b, ${valueSql} AS v
                    FROM (${source}) s WHERE t >= $1 AND t <= $2 GROUP BY 1) x ON x.b = b.b
         ORDER BY b.b`,
        params,
    );

    // Nacheinander statt Promise.all: die Console hat nur einen pg-Client pro
    // DB, und der kann keine parallelen Queries.
    const [signups, events, revenue] = await sequential([
        () => perBucket(`SELECT created_at AS t FROM users WHERE id != '${SYSTEM_USER}' AND deleted_at IS NULL`),
        () => rows(
            `SELECT b.b AS b, k.kind, COALESCE(x.v, 0) AS v
             FROM (${bucketsSql}) b
             CROSS JOIN (VALUES ('messages'), ('contactRequests'), ('coins'), ('uploads')) k(kind)
             LEFT JOIN (SELECT date_trunc('${bucket}', t AT TIME ZONE '${TZ}') AS b, kind, COUNT(*) AS v
                        FROM (${EVENTS}) e WHERE t >= $1 AND t <= $2 GROUP BY 1, 2) x
                    ON x.b = b.b AND x.kind = k.kind
             ORDER BY b.b`,
            params,
        ),
        () => perBucket(`SELECT created_at AS t, amount FROM payment_logs WHERE status = 'success'`, 'SUM(amount)'),
    ]);

    const buckets = signups.map((r) => toIsoLocal(r.b));
    const byKind = (kind: string) => events.filter((r) => r.kind === kind).map((r) => Number(r.v));

    const [[before], [kpi], funnelRows, heatRows, planRows, interestRows, cityRows] = await sequential([
        () => rows(`SELECT COUNT(*) AS v FROM users WHERE id != '${SYSTEM_USER}' AND deleted_at IS NULL AND created_at < $1`, [params[0]]),
        () => rows(
            // Vergleichszeitraum: gleich lang, direkt davor
            `WITH w AS (SELECT $1::timestamptz AS f, $2::timestamptz AS t, $2::timestamptz - $1::timestamptz AS len)
             SELECT
               (SELECT COUNT(*) FROM users, w WHERE id != '${SYSTEM_USER}' AND created_at >= w.f AND created_at <= w.t) AS signups_cur,
               (SELECT COUNT(*) FROM users, w WHERE id != '${SYSTEM_USER}' AND created_at >= w.f - w.len AND created_at < w.f) AS signups_prev,
               (SELECT COUNT(*) FROM (${EVENTS}) e, w WHERE e.t >= w.f AND e.t <= w.t) AS activity_cur,
               (SELECT COUNT(*) FROM (${EVENTS}) e, w WHERE e.t >= w.f - w.len AND e.t < w.f) AS activity_prev,
               (SELECT COALESCE(SUM(amount), 0) FROM payment_logs, w WHERE status = 'success' AND created_at >= w.f AND created_at <= w.t) AS revenue_cur,
               (SELECT COALESCE(SUM(amount), 0) FROM payment_logs, w WHERE status = 'success' AND created_at >= w.f - w.len AND created_at < w.f) AS revenue_prev,
               (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS subs_cur,
               (SELECT COUNT(*) FROM subscriptions, w WHERE status = 'active' AND started_at < w.f) AS subs_prev`,
            params,
        ),
        // Jede Stufe ist Teilmenge der vorigen, sonst ist es kein Trichter
        () => rows(
            `WITH u AS (
               SELECT u.id, u.is_verified,
                      p.photo_id IS NOT NULL AS photo,
                      EXISTS (SELECT 1 FROM contact_requests c WHERE c.sender_id = u.id)
                        OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = u.id) AS contacted,
                      EXISTS (SELECT 1 FROM conversations c WHERE u.id IN (c.user_a_id, c.user_b_id)) AS conversation,
                      EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'active') AS premium
               FROM users u LEFT JOIN profiles p ON p.user_id = u.id
               WHERE u.id != '${SYSTEM_USER}' AND u.deleted_at IS NULL)
             SELECT COUNT(*) AS registered,
                    COUNT(*) FILTER (WHERE is_verified) AS verified,
                    COUNT(*) FILTER (WHERE is_verified AND photo) AS photo,
                    COUNT(*) FILTER (WHERE is_verified AND photo AND contacted) AS contacted,
                    COUNT(*) FILTER (WHERE is_verified AND photo AND contacted AND conversation) AS conversation,
                    COUNT(*) FILTER (WHERE is_verified AND photo AND contacted AND conversation AND premium) AS premium
             FROM u`,
        ),
        () => rows(
            `SELECT EXTRACT(ISODOW FROM t AT TIME ZONE '${TZ}')::int - 1 AS d,
                    EXTRACT(HOUR FROM t AT TIME ZONE '${TZ}')::int AS h, COUNT(*) AS v
             FROM (${EVENTS}) e WHERE t >= $1 AND t <= $2 GROUP BY 1, 2`,
            params,
        ),
        () => rows(`SELECT plan, COUNT(*) AS v FROM subscriptions WHERE status = 'active' GROUP BY plan`),
        () => rows(
            `SELECT i.name_de AS name, COUNT(*) AS v FROM user_interests ui JOIN interests i ON i.id = ui.interest_id
             GROUP BY i.name_de ORDER BY v DESC, name LIMIT 8`,
        ),
        () => rows(
            `SELECT city AS name, COUNT(*) AS v FROM profiles WHERE city IS NOT NULL AND city != ''
             GROUP BY city ORDER BY v DESC, name LIMIT 8`,
        ),
    ]);

    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const r of heatRows) heatmap[Number(r.d)][Number(r.h)] = Number(r.v);

    const f = funnelRows[0];
    const planCount = (plan: string) => Number(planRows.find((r) => r.plan === plan)?.v ?? 0);

    return {
        range: {
            days, bucket, from: from.toISOString(), to: to.toISOString(),
            launchedAt: win.launched ? new Date(win.launched as string).toISOString() : null,
        },
        buckets,
        series: {
            signups: signups.map((r) => Number(r.v)),
            messages: byKind('messages'),
            contactRequests: byKind('contactRequests'),
            coins: byKind('coins'),
            uploads: byKind('uploads'),
            revenue: revenue.map((r) => Math.round(Number(r.v) * 100) / 100),
        },
        usersBefore: Number(before.v),
        kpis: {
            signups: { current: Number(kpi.signups_cur), previous: Number(kpi.signups_prev) },
            activity: { current: Number(kpi.activity_cur), previous: Number(kpi.activity_prev) },
            revenue: { current: Number(kpi.revenue_cur), previous: Number(kpi.revenue_prev) },
            activeSubscriptions: { current: Number(kpi.subs_cur), previous: Number(kpi.subs_prev) },
        },
        funnel: (['registered', 'verified', 'photo', 'contacted', 'conversation', 'premium'] as const)
            .map((key) => ({ key, count: Number(f[key]) })),
        heatmap,
        plans: (['monthly', 'yearly', 'lifetime'] as const).map((plan) => ({ plan, count: planCount(plan) })),
        topInterests: interestRows.map((r) => ({ name: String(r.name), count: Number(r.v) })),
        topCities: cityRows.map((r) => ({ name: String(r.name), count: Number(r.v) })),
    };
}

async function sequential<T>(steps: (() => Promise<T>)[]): Promise<T[]> {
    const out: T[] = [];
    for (const step of steps) out.push(await step());
    return out;
}

// Bucket-Start kommt als "timestamp without time zone" (Berliner Wandzeit) —
// pg/TypeORM machen daraus ein Date in Server-Zeit. Als "YYYY-MM-DDTHH:00"
// ohne Zone weitergeben, das Frontend zeigt es so an.
function toIsoLocal(v: unknown): string {
    if (typeof v === 'string') return v.replace(' ', 'T').slice(0, 16);
    const d = v as Date;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}
