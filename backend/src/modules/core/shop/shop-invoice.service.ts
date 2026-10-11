import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SHOP_INVOICE_QUEUE } from '../../../common/queue/queue.constants';
import type { ShopInvoiceJob } from './shop-invoice.processor';

const CAPTURED = ['approved', 'fulfilled', 'partially_refunded', 'refunded'];
const LIST = 'SELECT id, kind, invoice_number, amount_cents, issued_at, sent_at FROM shop_invoices';

// API-Seite der Rechnungen: Jobs einreihen (erzeugt/versendet der Worker), auflisten, PDF ausliefern
@Injectable()
export class ShopInvoiceService {
    private readonly logger = new Logger(ShopInvoiceService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectQueue(SHOP_INVOICE_QUEUE) private readonly queue: Queue<ShopInvoiceJob>,
    ) { }

    // Nach Annahme/Erstattung: darf die Aktion nie scheitern lassen (Geld ist schon geflossen).
    // Fehlt danach ein Beleg, legt "Rechnung senden" im Admin ihn an; ein Storno legt die Rechnung mit an.
    async enqueue(job: ShopInvoiceJob): Promise<void> {
        try {
            await this.queue.add(job.kind, job);
        } catch (err) {
            this.logger.error(`Beleg fuer Bestellung ${job.orderId} nicht eingereiht: ${(err as Error).message}`);
        }
    }

    // Admin: Rechnung anlegen, falls sie fehlt, und (erneut) an den Kaeufer senden
    async resend(orderId: string) {
        const [order] = await this.dataSource.query('SELECT status FROM shop_orders WHERE id = $1', [orderId]);
        if (!order) throw new NotFoundException('Bestellung nicht gefunden');
        if (!CAPTURED.includes(order.status)) throw new ConflictException('Rechnungen gibt es erst nach der Annahme');
        await this.queue.add('invoice', { kind: 'invoice', orderId, resend: true });
        return { queued: true };
    }

    listForOrder(orderId: string) {
        return this.dataSource.query(`${LIST} WHERE order_id = $1 ORDER BY issued_at`, [orderId]);
    }

    async listMine(userId: string, orderId: string) {
        const [own] = await this.dataSource.query('SELECT 1 FROM shop_orders WHERE id = $1 AND user_id = $2', [orderId, userId]);
        if (!own) throw new NotFoundException('Bestellung nicht gefunden');
        return this.listForOrder(orderId);
    }

    // userId null = Admin (jede Rechnung)
    async pdf(invoiceId: string, userId: string | null): Promise<{ number: string; pdf: Buffer }> {
        const [row] = await this.dataSource.query(
            `SELECT i.invoice_number, i.pdf FROM shop_invoices i JOIN shop_orders o ON o.id = i.order_id
              WHERE i.id = $1 AND ($2::uuid IS NULL OR o.user_id = $2)`,
            [invoiceId, userId],
        );
        if (!row) throw new NotFoundException('Beleg nicht gefunden');
        return { number: row.invoice_number, pdf: row.pdf };
    }
}
