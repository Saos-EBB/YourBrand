/**
 * Demo-Daten fuer das Modul shop: 1000 Artikel (Essen, Merch, Lizenzen,
 * Freischalt-Codes) ueber Kategorien, Preise und Bewertungen verteilt, damit Filter und Sortierung
 * etwas zu tun haben. No-op, wenn der Mandant das Modul nicht an hat.
 * Ausfuehren: npx ts-node -r tsconfig-paths/register src/database/seeds/seed-shop.ts
 *
 * Deterministisch (fester Seed) und idempotent: Artikel per SKU, Bewertungen
 * per (Artikel, User). Bewertungen kommen von den Demo-Usern — die Regel
 * "nur Kaeufer" prueft der ShopService, nicht die DB.
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

const PRODUCT_COUNT = 1000;

// [Kategorie, Art, Nomen, Preisspanne in Cent, MwSt, Freischalt-Ziele]
// Essen 7 %, Rest 19 %. unlock: Ziel in der App oder null = externer Code.
// license-Artikel bekommen ihre Keys erst ueber den Admin-Import — bis dahin
// sind sie "ausverkauft", wie im echten Betrieb.
const CATEGORIES: [string, string, string[], [number, number], number, (string | null)[]][] = [
    ['pizza', 'food', ['Pizza', 'Calzone', 'Focaccia'], [690, 1490], 7, []],
    ['bowls', 'food', ['Bowl', 'Salat', 'Wrap', 'Suppe'], [590, 1290], 7, []],
    ['merch', 'physical', ['T-Shirt', 'Hoodie', 'Tasse', 'Sticker-Set', 'Jutebeutel', 'Cap'], [299, 4990], 19, []],
    ['software', 'license', ['App-Lizenz', 'Plugin', 'Tool', 'Add-on'], [499, 9900], 19, []],
    ['in-app', 'unlock', ['Premium-Pass', 'Coin-Paket'], [199, 2999], 19, ['premium:30', 'premium:365', 'coins:500', 'coins:2000']],
    ['gutscheine', 'unlock', ['Gutschein', 'Kinoticket', 'Kurs-Zugang'], [500, 5000], 19, [null]],
];
const TOPICS = [
    'Kiez', 'Garten', 'Fotografie', 'Finanzen', 'Fitness', 'Yoga', 'Programmieren', 'Design', 'Musik',
    'Italienisch', 'Brot backen', 'Zeitmanagement', 'Fahrrad', 'Nachbarschaft', 'Upcycling', 'Schach',
    'Achtsamkeit', 'Steuern', 'Marketing', 'Zeichnen',
];
const ADJECTIVES = ['Einfach', 'Kompakt', 'Profi', 'Basis', 'Kreativ', 'Grün', 'Schnell', 'Großes'];

// mulberry32 — gleicher Seed, gleiche Artikel bei jedem Lauf
function rng(seed: number): () => number {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

async function seedProducts(): Promise<void> {
    const rand = rng(1000);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
    const rows: unknown[][] = [];
    for (let i = 1; i <= PRODUCT_COUNT; i++) {
        const [category, fulfillment, nouns, [min, max], vat, targets] = CATEGORIES[i % CATEGORIES.length];
        const topic = pick(TOPICS);
        // Preise enden auf 9, schief verteilt (mehr guenstige als teure)
        const price = Math.round((min + (max - min) * rand() ** 2) / 10) * 10 - 1;
        rows.push([
            `DEMO-${String(i).padStart(4, '0')}`,
            `${pick(ADJECTIVES)}: ${pick(nouns)} ${topic}`,
            `${pick(nouns)} rund um ${topic}.`,
            category,
            fulfillment,
            fulfillment === 'unlock' ? pick(targets) : null,
            Math.max(price, min),
            vat,
            // Merch hat Lagerbestand, der Rest ist unbegrenzt
            fulfillment === 'physical' ? Math.floor(rand() * 50) : null,
            Math.floor(rand() * 365),
        ]);
    }
    // In Bloecken, ein INSERT pro Artikel waere unnoetig langsam
    for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const values = chunk.map((_, j) => {
            const b = j * 10;
            const p = (n: number) => `$${b + n}`;
            return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, now() - make_interval(days => ${p(10)}))`;
        });
        await ds.query(
            `INSERT INTO shop_products (sku, title, description, category, fulfillment, unlock_target, price_cents, vat_rate, stock, created_at)
             VALUES ${values.join(', ')}
             ON CONFLICT (sku) DO NOTHING`,
            chunk.flat(),
        );
    }
}

async function seedReviews(): Promise<void> {
    const users: { user_id: string }[] = await ds.query(
        `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
          WHERE u.deleted_at IS NULL ORDER BY p.nickname`,
    );
    if (users.length === 0) return;
    const products: { id: string }[] = await ds.query(`SELECT id FROM shop_products WHERE sku LIKE 'DEMO-%' ORDER BY sku`);
    const rand = rng(7);
    const reviews: unknown[][] = [];
    for (const { id } of products) {
        // Ein Viertel ohne Bewertung, sonst 1 bis alle Demo-User; pro Artikel
        // eine Grundqualitaet, damit die Schnitte breit streuen
        if (rand() < 0.25) continue;
        const base = 1 + rand() * 4;
        const n = 1 + Math.floor(rand() * users.length);
        for (const { user_id } of users.slice(0, n)) {
            const rating = Math.min(5, Math.max(1, Math.round(base + (rand() - 0.5) * 2)));
            reviews.push([id, user_id, rating]);
        }
    }
    for (let i = 0; i < reviews.length; i += 500) {
        const chunk = reviews.slice(i, i + 500);
        const values = chunk.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`);
        await ds.query(
            `INSERT INTO shop_reviews (product_id, user_id, rating) VALUES ${values.join(', ')}
             ON CONFLICT (product_id, user_id) DO NOTHING`,
            chunk.flat(),
        );
    }
}

async function main(): Promise<void> {
    if (process.env.LOADTEST_MODE === 'true') return;
    if (!loadTenantConfig().modules.shop) return;
    await ds.initialize();
    try {
        await seedProducts();
        await seedReviews();
        const [{ count }] = await ds.query(`SELECT count(*)::int AS count FROM shop_products`);
        console.log(`seed-shop: ${count} Artikel`);
    } finally {
        await ds.destroy();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
