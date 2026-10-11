// Integrationstest gegen echtes Postgres: der ganze Weg einer Bestellung mit den echten
// Services und echtem SQL. Ersetzt sind nur Stripe (Zahlungsanbieter im Broker), Mail,
// Socket-Events und die Queue (Jobs laufen direkt im Test). Startet nur mit SHOP_IT_DB —
// am einfachsten ueber scripts/shop_test.sh (frische DB mit allen Migrationen).
import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ModuleBroker, type PaymentEvent } from '../../shared/broker/module-broker';
import { ShopAdminService } from './shop-admin.service';
import { ShopAlertService } from './shop-alert.service';
import { ShopBuyerMailService } from './shop-buyer-mail.service';
import { ShopCasesService } from './shop-cases.service';
import { ShopCheckoutService } from './shop-checkout.service';
import { ShopFollowUpService } from './shop-follow-up.service';
import { ShopFulfillmentService } from './shop-fulfillment.service';
import { ShopIntakeService } from './shop-intake.service';
import { ShopInvoiceProcessor, type ShopInvoiceJob } from './shop-invoice.processor';
import { ShopInvoiceService } from './shop-invoice.service';
import { ShopOrdersAdminService } from './shop-orders-admin.service';
import { ShopOrdersService } from './shop-orders.service';
import { ShopPaymentEventsService } from './shop-payment-events.service';
import { ShopRedeemService } from './shop-redeem.service';
import { ShopRefundService } from './shop-refund.service';
import { ShopRiskService } from './shop-risk.service';

const DB = process.env.SHOP_IT_DB;
const run = DB ? describe : describe.skip;
process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const inOneHour = () => new Date(Date.now() + 3600_000).toISOString();
const SELLER = { name: 'Test GmbH', address: 'Teststr. 1, 10115 Berlin', email: 'shop@test.example', vatId: 'DE123456789' };

run('Shop Integration (echtes Postgres)', () => {
    let ds: DataSource;
    let s: ReturnType<typeof wire>;
    const ids = { buyer: '', buyer2: '', admin: '' };
    const products: Record<string, string> = {};

    // Stripe-Ersatz: merkt sich, was abgebucht/aufgehoben/erstattet wurde
    const stripe = {
        n: 0,
        calls: [] as string[],
        createReservedCheckout: jest.fn(async () => ({ sessionId: `cs_${++stripe.n}`, clientSecret: 'secret' })),
        capture: jest.fn(async (pi: string) => { stripe.calls.push(`capture ${pi}`); }),
        cancel: jest.fn(async (pi: string) => { stripe.calls.push(`cancel ${pi}`); }),
        refund: jest.fn(async (pi: string, amount: number) => { stripe.calls.push(`refund ${pi} ${amount}`); return { refundId: `re_${++stripe.n}` }; }),
    };
    const unlocked: { userId: string; amount: number }[] = [];
    const mail = {
        sendShopAlertEmail: jest.fn(async () => undefined),
        sendShopInvoiceEmail: jest.fn(async () => undefined),
        sendShopOrderReceivedEmail: jest.fn(async () => undefined),
        sendShopOrderDeclinedEmail: jest.fn(async () => undefined),
    };
    const socket = { emit: jest.fn() };
    const jobs: ShopInvoiceJob[] = [];
    const settings = { getNumber: async (_k: string, fallback: number) => fallback };

    function wire() {
        const broker = new ModuleBroker();
        broker.providePayments(stripe);
        broker.provideUnlock('coins', async ({ userId, amount }) => { unlocked.push({ userId, amount }); });
        const alerts = new ShopAlertService(ds, socket as any, mail as any);
        const cases = new ShopCasesService(ds, alerts);
        const fulfillment = new ShopFulfillmentService(ds, cases, alerts);
        const invoices = new ShopInvoiceService(ds, { add: async (_n: string, job: ShopInvoiceJob) => { jobs.push(job); } } as any);
        const buyerMail = new ShopBuyerMailService(ds, mail as any);
        const orders = new ShopOrdersAdminService(ds, broker, fulfillment, invoices, buyerMail);
        const intake = new ShopIntakeService(ds, new ShopRiskService(settings as any), orders, alerts, buyerMail);
        const refunds = new ShopRefundService(ds, broker, invoices);
        const events = new ShopPaymentEventsService(ds, broker, intake, refunds, cases, alerts, buyerMail);
        events.onModuleInit();
        const processor = new ShopInvoiceProcessor(ds, mail as any);
        jest.spyOn(processor as any, 'seller').mockReturnValue(SELLER);
        return {
            broker, cases, fulfillment, orders, refunds, events, processor,
            checkout: new ShopCheckoutService(ds, broker, settings as any),
            admin: new ShopAdminService(ds),
            buyerOrders: new ShopOrdersService(ds),
            redeem: new ShopRedeemService(ds, broker),
            followUp: new ShopFollowUpService(ds, broker, alerts, buyerMail, intake),
        };
    }

    // Was der Webhook ueber den Broker schicken wuerde
    const authorized = (orderId: string, amountCents: number, pi: string): PaymentEvent => ({
        type: 'authorized', paymentIntentId: pi, metadata: { kind: 'shop', orderId }, amountCents,
        risk: { level: 'normal', score: 10 }, card: { fingerprint: `fp_${pi}`, country: 'DE' },
        billing: { name: 'Kim Test', email: 'kim@test.example', address: 'Kiezstr. 1\n10999 Berlin\nDE' },
    });
    const send = (e: PaymentEvent) => s.broker.dispatchPaymentEvent('shop', e);
    const order = async (id: string) => (await ds.query('SELECT * FROM shop_orders WHERE id = $1', [id]))[0];
    const eventTypes = async (id: string) => (await ds.query('SELECT type FROM shop_order_events WHERE order_id = $1 ORDER BY id', [id])).map((r: { type: string }) => r.type);
    const runJobs = async () => { while (jobs.length) await s.processor.process({ data: jobs.shift()! } as any); };
    const total = async (id: string) => (await order(id)).total_cents as number;

    beforeAll(async () => {
        ds = await new DataSource({
            type: 'postgres', host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 55432),
            username: process.env.DB_USER, password: process.env.DB_PASSWORD, database: DB,
        }).initialize();
        s = wire();
        for (const [key, role] of [['buyer', 'user'], ['buyer2', 'user'], ['admin', 'admin']] as const) {
            const [u] = await ds.query(
                `INSERT INTO users (role, email, email_search_hash) VALUES ($1, NULL, $2) RETURNING id`,
                [role, randomBytes(32).toString('hex')],
            );
            ids[key] = u.id;
        }
        const mk = async (key: string, dto: Record<string, unknown>) => { products[key] = (await s.admin.createProduct(dto as any)).id; };
        await mk('license', { sku: 'IT-LIC', fulfillment: 'license', title: 'Lizenz', category: 'Software', price_cents: 990 });
        await mk('coins', { sku: 'IT-COIN', fulfillment: 'unlock', title: 'Coins', category: 'In-App', price_cents: 500, unlock_target: 'coins:500' });
        await mk('mug', { sku: 'IT-MUG', fulfillment: 'physical', title: 'Tasse', category: 'Merch', price_cents: 6000, stock: 3 });
        await mk('pizza', { sku: 'IT-PIZ', fulfillment: 'food', title: 'Pizza', category: 'Pizza', price_cents: 1200 });
        await s.admin.addCodes(products.license, ['KEY-AAAA-0001', 'KEY-AAAA-0002']);
    });

    afterAll(async () => { await ds?.destroy(); });

    let digital: string;
    let merch: string;

    it('digital, unauffaellig: System nimmt an, Key + Code, Rechnung, Code einloesen', async () => {
        const { orderId } = await s.checkout.checkout(ids.buyer, {
            items: [{ productId: products.license, quantity: 1 }, { productId: products.coins, quantity: 1 }],
            deliveryMode: 'digital', withdrawalWaiver: true,
        } as any);
        digital = orderId;
        expect((await order(orderId)).status).toBe('pending');

        await send(authorized(orderId, 1490, 'pi_d'));
        await send(authorized(orderId, 1490, 'pi_d')); // Stripe stellt doppelt zu
        const o = await order(orderId);
        expect(o.status).toBe('fulfilled');
        expect(o.decided_by).toBeNull();
        expect(o.buyer_email).toBe('kim@test.example');
        expect(stripe.calls).toEqual(['capture pi_d']);
        expect(await eventTypes(orderId)).toEqual(['created', 'authorized', 'approved', 'fulfilled']);
        expect(mail.sendShopOrderReceivedEmail).toHaveBeenCalledTimes(1);

        await runJobs();
        const [inv] = await ds.query(`SELECT invoice_number, amount_cents FROM shop_invoices WHERE order_id = $1`, [orderId]);
        expect(inv.invoice_number).toMatch(/^RE-\d{4}-000001$/);
        expect(inv.amount_cents).toBe(1490);
        expect(mail.sendShopInvoiceEmail).toHaveBeenCalledWith('kim@test.example', expect.any(String), expect.any(String), `${inv.invoice_number}.pdf`, expect.any(Buffer));

        const mine = await s.buyerOrders.getMine(ids.buyer, orderId);
        const codes = mine.items.flatMap((i: { codes: { code: string }[] }) => i.codes.map((c) => c.code));
        // ein Key aus dem Vorrat (gleicher Import = gleicher Zeitstempel, welcher ist egal) + ein erzeugter Code
        expect(codes.filter((c: string) => c.startsWith('KEY-AAAA-'))).toHaveLength(1);
        expect(codes).toHaveLength(2);
        const unlockCode = mine.items.find((i: { fulfillment: string }) => i.fulfillment === 'unlock').codes[0].code;
        await expect(s.redeem.redeem(ids.buyer, unlockCode.toLowerCase())).resolves.toEqual({ kind: 'coins', amount: 500 });
        expect(unlocked).toEqual([{ userId: ids.buyer, amount: 500 }]);
        await expect(s.redeem.redeem(ids.buyer, unlockCode)).rejects.toBeInstanceOf(ConflictException);
        await expect(s.buyerOrders.getMine(ids.buyer2, orderId)).rejects.toThrow(/nicht gefunden/);
    });

    it('Merch ueber 150 €: angehalten, Mensch nimmt an, Bestand, Lieferstand bis zugestellt', async () => {
        const { orderId } = await s.checkout.checkout(ids.buyer2, {
            items: [{ productId: products.mug, quantity: 3 }], deliveryMode: 'shipping', deliveryAddress: 'Sid\nHafenstr. 3\n20457 Hamburg',
        } as any);
        merch = orderId;
        await send(authorized(orderId, await total(orderId), 'pi_m'));
        let o = await order(orderId);
        expect(o.status).toBe('held');
        expect(o.hold_reasons).toEqual(['amount_high', 'new_buyer']);
        expect(new Date(o.decide_by).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
        expect(socket.emit).toHaveBeenCalledWith('shop.alert', { kind: 'order_held', orderId });

        await s.orders.approve(ids.admin, orderId, 'angerufen, passt');
        o = await order(orderId);
        expect([o.status, o.progress, o.decided_by]).toEqual(['approved', 'accepted', ids.admin]);
        expect((await ds.query('SELECT stock FROM shop_products WHERE id = $1', [products.mug]))[0].stock).toBe(0);

        // Ausverkauft: die naechste Kasse wird abgewiesen
        await expect(s.checkout.checkout(ids.buyer, {
            items: [{ productId: products.mug, quantity: 1 }], deliveryMode: 'shipping', deliveryAddress: 'X\nY 1\n10000 Z',
        } as any)).rejects.toBeInstanceOf(BadRequestException);

        await s.fulfillment.setProgress(ids.admin, orderId, 'shipped', 'DHL-1');
        await s.fulfillment.setProgress(ids.admin, orderId, 'delivered');
        o = await order(orderId);
        expect([o.status, o.progress, o.tracking_number]).toEqual(['fulfilled', 'delivered', 'DHL-1']);
        await runJobs();
        expect((await ds.query(`SELECT invoice_number FROM shop_invoices WHERE order_id = $1`, [orderId]))[0].invoice_number).toMatch(/-000002$/);
    });

    it('Erstattung: teilweise im Admin, Rest im Stripe-Dashboard — je eine Stornorechnung, nichts doppelt', async () => {
        const t = await total(merch);
        await s.refunds.refund(ids.admin, merch, 490, 'Versand zu spät');
        await send({ type: 'refunded', paymentIntentId: 'pi_m', metadata: { kind: 'shop', orderId: merch }, refunds: [{ id: `re_${stripe.n}`, amountCents: 490 }] });
        expect((await order(merch)).refunded_cents).toBe(490);

        await send({
            type: 'refunded', paymentIntentId: 'pi_m', metadata: { kind: 'shop', orderId: merch },
            refunds: [{ id: `re_${stripe.n}`, amountCents: 490 }, { id: 're_dashboard', amountCents: t - 490 }],
        });
        const o = await order(merch);
        expect([o.status, o.refunded_cents]).toEqual(['refunded', t]);
        await runJobs();
        const docs = await ds.query(`SELECT kind, invoice_number, amount_cents FROM shop_invoices WHERE order_id = $1 ORDER BY invoice_number`, [merch]);
        expect(docs.map((d: { kind: string; amount_cents: number }) => [d.kind, d.amount_cents])).toEqual([['invoice', t], ['credit_note', -490], ['credit_note', -(t - 490)]]);
        // Zaehler laeuft ueber Rechnungen und Stornos ohne Luecke
        const numbers = (await ds.query(`SELECT invoice_number FROM shop_invoices ORDER BY invoice_number`)).map((r: { invoice_number: string }) => Number(r.invoice_number.slice(-6)));
        expect(numbers).toEqual([1, 2, 3, 4]);
    });

    it('Rueckbuchung: ein dringender Fall, auch bei doppelter Meldung; Ausgang als Notiz', async () => {
        const dispute = { type: 'dispute_opened' as const, paymentIntentId: 'pi_d', metadata: { kind: 'shop', orderId: digital }, disputeId: 'dp_1', amountCents: 1490, reason: 'fraudulent' };
        await send(dispute);
        await send(dispute);
        await send({ type: 'dispute_closed', paymentIntentId: 'pi_d', metadata: { kind: 'shop', orderId: digital }, disputeId: 'dp_1', status: 'lost' });
        const cases = await ds.query(`SELECT id, kind, priority, against_user_id FROM shop_cases WHERE order_id = $1`, [digital]);
        expect(cases).toHaveLength(1);
        expect(cases[0]).toMatchObject({ kind: 'dispute', priority: 'urgent', against_user_id: ids.buyer });
        const notes = await ds.query(`SELECT body, internal FROM shop_case_messages WHERE case_id = $1 ORDER BY created_at`, [cases[0].id]);
        expect(notes.map((n: { internal: boolean }) => n.internal)).toEqual([true, true]);
        expect(notes[1].body).toMatch(/verloren/);
    });

    it('Frist: Erinnerung, dann verfaellt die Reservierung; Kaeufer bekommt Bescheid', async () => {
        // Rueckbuchung von eben: der Kaeufer wird jetzt angehalten
        const { orderId } = await s.checkout.checkout(ids.buyer, {
            items: [{ productId: products.pizza, quantity: 1 }], deliveryMode: 'pickup', contactName: 'Kim', contactPhone: '0151 1', desiredAt: inOneHour(),
        } as any);
        await send(authorized(orderId, await total(orderId), 'pi_p'));
        let o = await order(orderId);
        expect(o.status).toBe('held');
        expect(o.hold_reasons).toEqual(['previous_dispute']);
        expect(new Date(o.decide_by).getTime() - Date.now()).toBeLessThan(31 * 60_000);

        await s.followUp.remindDecisions();
        await s.followUp.remindDecisions();
        await ds.query(`UPDATE shop_orders SET decide_by = now() - interval '1 minute' WHERE id = $1`, [orderId]);
        await s.followUp.expireHeld();
        o = await order(orderId);
        expect(o.status).toBe('expired');
        expect(stripe.calls).toContain('cancel pi_p');
        expect(await eventTypes(orderId)).toEqual(['created', 'authorized', 'held', 'reminder', 'expired']);
        expect(mail.sendShopOrderDeclinedEmail).toHaveBeenCalledWith(expect.any(String), orderId.slice(0, 8).toUpperCase(), 'expired', expect.any(String));

        // Stripe meldet die Aufhebung danach nochmal: aendert nichts
        await send({ type: 'canceled', paymentIntentId: 'pi_p', metadata: { kind: 'shop', orderId } });
        expect(await eventTypes(orderId)).toHaveLength(5);
    });

    it('Kasse abgelaufen: pending → cancelled, taucht beim Kaeufer nicht auf', async () => {
        const { orderId } = await s.checkout.checkout(ids.buyer2, {
            items: [{ productId: products.pizza, quantity: 2 }], deliveryMode: 'pickup', contactName: 'Sid', contactPhone: '0151 2', desiredAt: inOneHour(),
        } as any);
        await send({ type: 'checkout_expired', paymentIntentId: null, metadata: { kind: 'shop', orderId } });
        expect((await order(orderId)).status).toBe('cancelled');
        const mine = await s.buyerOrders.listMine(ids.buyer2);
        expect(mine.items.map((i: { id: string }) => i.id)).not.toContain(orderId);
    });
});
