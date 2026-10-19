// Nur fuer scripts/shop_demo.sh: Testbestellungen in allen Zustaenden, damit
// Admin-Konsole und "Meine Bestellungen" ohne Stripe etwas zeigen. Annehmen
// laeuft ueber den echten ShopFulfillmentService (Keys zuteilen, Codes
// erzeugen) — nur das Abbuchen bei Stripe faellt weg. Idempotent: laeuft
// nicht nochmal, sobald es Bestellungen mit pi_demo_* gibt.
import 'reflect-metadata';
// backend/.env (Skript laeuft mit cwd backend/): APP_ENCRYPTION_KEY fuer Keys/Codes
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { encryptField } from '../../backend/src/common/crypto/crypto.helper';
import { hashShopCode } from '../../backend/src/modules/core/shop/shop-admin.service';
import { ShopCasesService } from '../../backend/src/modules/core/shop/shop-cases.service';
import { ShopFulfillmentService } from '../../backend/src/modules/core/shop/shop-fulfillment.service';
import type { ShopAlertService } from '../../backend/src/modules/core/shop/shop-alert.service';

// Auto-Login-User (Admin) bestellt selbst mit, damit "Meine Bestellungen" gefuellt ist
const ME = process.env.SHOP_DEMO_USER ?? 'gutz';
const OTHERS = ['saos43', 'sid', 'tifa'];

type Spec = {
    who: string; status: 'held' | 'approved' | 'fulfilled' | 'rejected'; mode: 'pickup' | 'delivery' | 'shipping' | 'digital';
    product: string; qty: number; reasons?: string[]; decideMin?: number; radar?: string; problem?: string;
};

// product: SQL-Bedingung auf shop_products p
const SPECS: Spec[] = [
    { who: OTHERS[0], status: 'held', mode: 'delivery', product: `p.fulfillment = 'food'`, qty: 4, reasons: ['amount_high', 'new_buyer'], decideMin: 25, radar: 'elevated' },
    { who: OTHERS[1], status: 'held', mode: 'digital', product: `p.fulfillment = 'license'`, qty: 2, reasons: ['card_reuse'], decideMin: 90, radar: 'highest' },
    { who: OTHERS[0], status: 'held', mode: 'shipping', product: `p.fulfillment = 'physical'`, qty: 2, reasons: ['velocity'], decideMin: 300 },
    { who: OTHERS[2], status: 'held', mode: 'pickup', product: `p.fulfillment = 'food'`, qty: 1, reasons: ['previous_dispute'], decideMin: 50 },
    { who: ME, status: 'approved', mode: 'delivery', product: `p.fulfillment = 'food'`, qty: 2 },
    { who: ME, status: 'approved', mode: 'shipping', product: `p.fulfillment = 'physical'`, qty: 1, problem: 'Der Aufdruck ist schief und ein Ärmel hat ein Loch.' },
    { who: ME, status: 'fulfilled', mode: 'digital', product: `p.unlock_target LIKE 'coins:%' AND p.title LIKE '%Coin%'`, qty: 1 },
    { who: ME, status: 'fulfilled', mode: 'digital', product: `p.unlock_target = 'premium:30'`, qty: 1 },
    { who: ME, status: 'fulfilled', mode: 'digital', product: `p.fulfillment = 'license'`, qty: 1 },
    { who: OTHERS[2], status: 'rejected', mode: 'delivery', product: `p.fulfillment = 'food'`, qty: 3, reasons: ['amount_high'] },
];

async function main() {
    const ds = await new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
        username: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.SHOP_DEMO_DB,
    }).initialize();
    try {
        const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM shop_orders WHERE stripe_payment_intent_id LIKE 'pi_demo_%'`);
        if (n > 0) { console.log(`[shop-demo] ${n} Testbestellungen vorhanden — uebersprungen`); return; }

        const users: Record<string, string> = Object.fromEntries(
            (await ds.query(`SELECT user_id, nickname FROM profiles WHERE nickname = ANY($1)`, [[ME, ...OTHERS]]))
                .map((r: { user_id: string; nickname: string }) => [r.nickname, r.user_id]),
        );
        for (const nick of [ME, ...OTHERS]) if (!users[nick]) throw new Error(`Demo-User ${nick} fehlt (demo-seed gelaufen?)`);
        const admin = users[ME];

        // Lizenzen brauchen Keys: je 5 fuer die ersten Lizenz-Artikel
        const licenses = await ds.query(`SELECT id, sku FROM shop_products WHERE fulfillment = 'license' AND active ORDER BY sku LIMIT 3`);
        for (const l of licenses) {
            for (let i = 1; i <= 5; i++) {
                const key = `${l.sku}-KEY-${String(i).padStart(4, '0')}`;
                await ds.query(
                    `INSERT INTO shop_codes (product_id, code_encrypted, code_hash) VALUES ($1, $2, $3) ON CONFLICT (code_hash) DO NOTHING`,
                    [l.id, encryptField(key), hashShopCode(key)],
                );
            }
        }

        // Seed alarmiert niemanden
        const noAlerts = { send: async () => undefined } as unknown as ShopAlertService;
        const cases = new ShopCasesService(ds, noAlerts);
        const fulfillment = new ShopFulfillmentService(ds, cases, noAlerts);
        let i = 0;
        for (const s of SPECS) {
            i++;
            const licenseOnly = s.product.includes(`'license'`) ? `AND p.id = ANY($1)` : 'AND $1::uuid[] IS NOT NULL';
            const [p] = await ds.query(
                `SELECT p.id, p.sku, p.title, p.fulfillment, p.price_cents, p.vat_rate FROM shop_products p
                  WHERE p.active AND ${s.product} ${licenseOnly} ORDER BY p.sku LIMIT 1`,
                [licenses.map((l: { id: string }) => l.id)],
            );
            if (!p) throw new Error(`Kein Artikel fuer ${s.product}`);
            const shipping = s.mode === 'shipping' ? 490 : 0;
            const items = p.price_cents * s.qty;
            const [o] = await ds.query(
                `INSERT INTO shop_orders (user_id, status, delivery_mode, items_cents, shipping_cents, total_cents,
                        contact_name, contact_phone, delivery_address, desired_at, withdrawal_waiver_at,
                        stripe_payment_intent_id, radar_risk, buyer_email, buyer_name, hold_reasons, decide_by,
                        authorized_at, created_at)
                 VALUES ($1, 'held', $2, $3, $4, $5, 'Kim Demo', '0151 2345678', $11,
                        CASE WHEN $12 THEN now() + interval '90 minutes' END,
                        CASE WHEN $13 THEN now() END,
                        $6, $7, 'kim@demo.example.com', 'Kim Demo', $8,
                        now() + make_interval(mins => $9), now() - make_interval(mins => $10), now() - make_interval(mins => $10))
                 RETURNING id`,
                [users[s.who], s.mode, items, shipping, items + shipping, `pi_demo_${i}`, s.radar ?? 'normal',
                    s.reasons ?? [], s.decideMin ?? 120, 130 - i * 10,
                    s.mode === 'delivery' || s.mode === 'shipping' ? 'Kim Demo\nKiezstraße 12\n10999 Berlin' : null,
                    s.mode === 'delivery' || s.mode === 'pickup', s.mode === 'digital'],
            );
            await ds.query(
                `INSERT INTO shop_order_items (order_id, product_id, sku, title, fulfillment, quantity, unit_price_cents, vat_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [o.id, p.id, p.sku, p.title, p.fulfillment, s.qty, p.price_cents, p.vat_rate],
            );
            await ds.query(
                `INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES
                    ($1, $2, 'created', '{}'), ($1, NULL, 'authorized', $3), ($1, NULL, 'held', $4)`,
                [o.id, users[s.who], JSON.stringify({ payment_intent: `pi_demo_${i}` }), JSON.stringify({ reasons: s.reasons ?? [] })],
            );

            if (s.status === 'rejected') {
                const note = 'Adresse und Karte passen nicht zusammen';
                await ds.query(`UPDATE shop_orders SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1`, [o.id, admin, note]);
                await ds.query(`INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'rejected', $3)`, [o.id, admin, JSON.stringify({ note })]);
            }
            if (s.status === 'approved' || s.status === 'fulfilled') {
                await ds.transaction(async (m) => {
                    await m.query(`UPDATE shop_orders SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1`, [o.id, admin]);
                    await m.query(`INSERT INTO shop_order_events (order_id, actor_id, type, data) VALUES ($1, $2, 'approved', '{}')`, [o.id, admin]);
                    await fulfillment.onApproved(m, o.id, s.mode);
                });
            }
            if (s.problem) await cases.openProblem(users[s.who], o.id, { reason: 'damaged', message: s.problem });
        }
        console.log(`[shop-demo] ${SPECS.length} Testbestellungen angelegt`);
    } finally {
        await ds.destroy();
    }
}

main().catch((err) => { console.error('[shop-demo] FEHLER:', err.message); process.exit(1); });
