import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { decryptField } from '../../../common/crypto/crypto.helper';
import { MailService } from '../../../common/mail/mail.service';
import { SHOP_INVOICE_QUEUE } from '../../../common/queue/queue.constants';
import { loadTenantConfig } from '../../../common/tenant/tenant-config.loader';
import { creditNoteBreakdown, euro, invoiceNumber, vatBreakdown, type VatBreakdown } from './shop-invoice';
import { formatDate, renderInvoicePdf, type InvoiceSeller } from './shop-invoice-pdf';

export type ShopInvoiceJob =
    | { kind: 'invoice'; orderId: string; resend?: boolean }
    | { kind: 'credit_note'; orderId: string; refundId: string; amountCents: number };

// Nur fuer abgebuchte Bestellungen gibt es Belege
const CAPTURED = ['approved', 'fulfilled', 'partially_refunded', 'refunded'];

interface Issued { id: string; invoice_number: string }

// UPDATE/INSERT ... RETURNING liefert bei pg je nach Befehl [rows, rowCount] oder rows
const rowsOf = <T>(r: unknown): T[] => ((Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r) as T[]);

// Nur im WorkerModule registriert. Nummer, PDF und Zeile entstehen in einer
// Transaktion: scheitert etwas, wird die Nummer nicht verbraucht (keine Luecken).
// Versand danach; scheitert die Mail, wiederholt BullMQ — der Beleg existiert dann
// schon und wird nur noch geschickt.
@Processor(SHOP_INVOICE_QUEUE)
export class ShopInvoiceProcessor extends WorkerHost {
    private readonly logger = new Logger(ShopInvoiceProcessor.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly mail: MailService,
    ) {
        super();
    }

    // Verkaeufer zum Rechnungszeitpunkt aus tenant.json (legal), wird mit gespeichert
    protected seller(): InvoiceSeller {
        return loadTenantConfig().legal;
    }

    async process(job: Job<ShopInvoiceJob>): Promise<void> {
        const data = job.data;
        const issued = await this.dataSource.transaction(async (m) => {
            const [order] = await m.query('SELECT status FROM shop_orders WHERE id = $1 FOR UPDATE', [data.orderId]);
            if (!order) throw new Error(`Bestellung ${data.orderId} fehlt`);
            if (!CAPTURED.includes(order.status)) {
                this.logger.warn(`Kein Beleg fuer Bestellung ${data.orderId}: Status ${order.status}`);
                return null;
            }
            return data.kind === 'invoice'
                ? this.issueInvoice(m, data.orderId)
                : this.issueCreditNote(m, data.orderId, data.refundId, data.amountCents);
        });
        if (!issued) return;
        // Alles Ungesendete der Bestellung (z. B. die Rechnung, die ein Storno erst angelegt hat)
        await this.sendPending(data.orderId, data.kind === 'invoice' && data.resend ? issued.id : null);
    }

    // BullMQ meldet Fehlschlaege nicht von selbst; nach dem letzten Versuch hilft "Rechnung senden" im Admin
    @OnWorkerEvent('failed')
    onFailed(job: Job<ShopInvoiceJob> | undefined, err: Error): void {
        if (!job) return;
        const last = job.attemptsMade >= (job.opts.attempts ?? 1);
        this.logger.error(`${job.data.kind} fuer Bestellung ${job.data.orderId}: ${err.message}` +
            ` (Versuch ${job.attemptsMade}${last ? ', aufgegeben' : ''})`);
    }

    async issueInvoice(m: EntityManager, orderId: string): Promise<Issued> {
        const [existing] = await m.query(
            `SELECT id, invoice_number FROM shop_invoices WHERE order_id = $1 AND kind = 'invoice'`, [orderId],
        );
        if (existing) return existing;
        const { order, items, breakdown } = await this.loadOrder(m, orderId);
        if (breakdown.grossCents !== order.total_cents) {
            throw new Error(`Bestellung ${orderId}: Positionen ${breakdown.grossCents} ≠ Gesamt ${order.total_cents}`);
        }
        const issuedAt = new Date();
        const number = invoiceNumber('invoice', berlinYear(issuedAt), await this.nextNumber(m, issuedAt));
        const seller = this.seller();
        const pdf = await renderInvoicePdf({
            kind: 'invoice', number, issuedAt, serviceDate: serviceDate(order, issuedAt), orderNo: orderNo(orderId), seller,
            buyer: buyerOf(order),
            lines: items.map((i) => ({
                quantity: i.quantity, title: i.title, sku: i.sku, unitGrossCents: i.unit_price_cents,
                grossCents: i.unit_price_cents * i.quantity, vatRate: i.vat_rate,
            })),
            shippingCents: order.shipping_cents, breakdown,
            paymentNote: `Bezahlt per Karte am ${formatDate(new Date(order.decided_at ?? issuedAt))}. Alle Preise inkl. MwSt.`,
        });
        return this.insert(m, { orderId, kind: 'invoice', number, amountCents: breakdown.grossCents, issuedAt, seller, pdf });
    }

    async issueCreditNote(m: EntityManager, orderId: string, refundId: string, amountCents: number): Promise<Issued> {
        const [existing] = await m.query('SELECT id, invoice_number FROM shop_invoices WHERE stripe_refund_id = $1', [refundId]);
        if (existing) return existing;
        // Erstattung vor der Rechnung (Job noch nicht gelaufen): Rechnung zuerst
        const invoice = await this.issueInvoice(m, orderId);
        const { order, breakdown: original } = await this.loadOrder(m, orderId);
        const breakdown = creditNoteBreakdown(original, amountCents);
        const issuedAt = new Date();
        const number = invoiceNumber('credit_note', berlinYear(issuedAt), await this.nextNumber(m, issuedAt));
        const seller = this.seller();
        const pdf = await renderInvoicePdf({
            kind: 'credit_note', number, issuedAt, serviceDate: serviceDate(order, issuedAt), correctsNumber: invoice.invoice_number,
            orderNo: orderNo(orderId), seller,
            buyer: buyerOf(order),
            lines: breakdown.rows.map((r) => ({
                quantity: 1, title: `Erstattung zu ${invoice.invoice_number}${breakdown.rows.length > 1 ? ` (Anteil ${r.rate} %)` : ''}`,
                unitGrossCents: r.grossCents, grossCents: r.grossCents, vatRate: r.rate,
            })),
            shippingCents: 0, breakdown,
            paymentNote: `Der Betrag von ${euro(amountCents)} wird auf das ursprüngliche Zahlungsmittel zurückgezahlt.`,
        });
        return this.insert(m, {
            orderId, kind: 'credit_note', number, amountCents: breakdown.grossCents, issuedAt, seller, pdf,
            correctsId: invoice.id, refundId,
        });
    }

    private async loadOrder(m: EntityManager, orderId: string) {
        const [order] = await m.query(
            `SELECT total_cents, shipping_cents, decided_at, fulfilled_at, desired_at, buyer_name, buyer_address,
                    contact_name, delivery_address
               FROM shop_orders WHERE id = $1`,
            [orderId],
        );
        const items: { title: string; sku: string; quantity: number; unit_price_cents: number; vat_rate: number }[] = await m.query(
            `SELECT title, sku, quantity, unit_price_cents, vat_rate::float AS vat_rate FROM shop_order_items WHERE order_id = $1 ORDER BY id`,
            [orderId],
        );
        const breakdown: VatBreakdown = vatBreakdown(
            items.map((i) => ({ grossCents: i.unit_price_cents * i.quantity, vatRate: i.vat_rate })), order.shipping_cents,
        );
        return { order, items, breakdown };
    }

    // Zaehler pro Jahr, gesperrt bis zum Commit — fortlaufend ohne Luecken
    private async nextNumber(m: EntityManager, at: Date): Promise<number> {
        const [row] = rowsOf<{ last_no: number }>(await m.query(
            `INSERT INTO shop_invoice_counters (year, last_no) VALUES ($1, 1)
             ON CONFLICT (year) DO UPDATE SET last_no = shop_invoice_counters.last_no + 1
             RETURNING last_no`,
            [berlinYear(at)],
        ));
        return row.last_no;
    }

    private async insert(m: EntityManager, b: {
        orderId: string; kind: 'invoice' | 'credit_note'; number: string; amountCents: number; issuedAt: Date;
        seller: InvoiceSeller; pdf: Buffer; correctsId?: string; refundId?: string;
    }): Promise<Issued> {
        const [row] = rowsOf<Issued>(await m.query(
            `INSERT INTO shop_invoices (order_id, kind, corrects_invoice_id, invoice_number, amount_cents, issued_at, seller, pdf, stripe_refund_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, invoice_number`,
            [b.orderId, b.kind, b.correctsId ?? null, b.number, b.amountCents, b.issuedAt, JSON.stringify(b.seller), b.pdf, b.refundId ?? null],
        ));
        await m.query(
            `INSERT INTO shop_order_events (order_id, type, data) VALUES ($1, 'invoice_issued', $2)`,
            [b.orderId, JSON.stringify({ kind: b.kind, number: b.number, amount_cents: b.amountCents })],
        );
        return row;
    }

    async sendPending(orderId: string, forceId: string | null): Promise<void> {
        const docs: { id: string; kind: string; invoice_number: string; pdf: Buffer; buyer_email: string | null; email: Buffer | null }[] =
            await this.dataSource.query(
                `SELECT i.id, i.kind, i.invoice_number, i.pdf, o.buyer_email, u.email
                   FROM shop_invoices i JOIN shop_orders o ON o.id = i.order_id LEFT JOIN users u ON u.id = o.user_id
                  WHERE i.order_id = $1 AND (i.sent_at IS NULL OR i.id = $2) ORDER BY i.issued_at`,
                [orderId, forceId],
            );
        for (const d of docs) {
            // Stripe-Mail aus dem Checkout, sonst die Konto-Mail
            const to = d.buyer_email ?? decryptField(d.email);
            if (!to) {
                this.logger.warn(`${d.invoice_number}: keine Mail-Adresse, nicht gesendet`);
                continue;
            }
            const invoice = d.kind === 'invoice';
            await this.mail.sendShopInvoiceEmail(
                to,
                `${invoice ? 'Deine Rechnung' : 'Deine Stornorechnung'} ${d.invoice_number}`,
                invoice
                    ? `Danke für deine Bestellung #${orderNo(orderId)}. Die Rechnung findest du im Anhang und jederzeit unter „Meine Bestellungen“.`
                    : `Zu deiner Bestellung #${orderNo(orderId)} wurde ein Betrag erstattet. Die Stornorechnung findest du im Anhang.`,
                `${d.invoice_number}.pdf`,
                d.pdf,
            );
            await this.dataSource.query('UPDATE shop_invoices SET sent_at = now() WHERE id = $1', [d.id]);
        }
    }
}

const orderNo = (id: string) => id.slice(0, 8).toUpperCase();

function berlinYear(d: Date): number {
    return Number(d.toLocaleString('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric' }));
}

// § 31 Abs. 4 UStDV: Kalendermonat der Leistung reicht, wenn der Tag noch nicht feststeht
function serviceDate(o: { fulfilled_at: string | null; desired_at: string | null }, issuedAt: Date): string {
    if (o.fulfilled_at) return formatDate(new Date(o.fulfilled_at));
    if (o.desired_at) return formatDate(new Date(o.desired_at));
    return new Date(issuedAt).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' });
}

// Lieferadressen beginnen oft schon mit dem Namen — dann nicht doppelt
export function buyerOf(o: { buyer_name: string | null; buyer_address: string | null; contact_name: string | null; delivery_address: string | null }) {
    const name = o.buyer_name ?? o.contact_name;
    const address = o.buyer_address ?? o.delivery_address;
    const firstLine = address?.split('\n')[0].trim();
    return { name: name && firstLine === name.trim() ? null : name, address };
}
