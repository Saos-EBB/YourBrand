import PDFDocument from 'pdfkit';
import { euro, type VatBreakdown } from './shop-invoice';

export interface InvoiceSeller { name: string; address: string; email: string; vatId?: string; taxNumber?: string }

export interface InvoicePdfData {
    kind: 'invoice' | 'credit_note';
    number: string;
    issuedAt: Date;
    // Leistungsdatum (§ 14 Abs. 4 Nr. 6 UStG)
    serviceDate: string;
    correctsNumber?: string;
    orderNo: string;
    seller: InvoiceSeller;
    buyer: { name: string | null; address: string | null };
    // Rechnung: Artikel; Storno: eine Zeile "Erstattung"
    lines: { quantity: number; title: string; sku?: string; unitGrossCents: number; grossCents: number; vatRate: number }[];
    shippingCents: number;
    breakdown: VatBreakdown;
    paymentNote: string;
}

const M = 50;
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#d1d5db';

export const formatDate = (d: Date) => d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });

// A4, Pflichtangaben nach § 14 Abs. 4 UStG. Standard-Schrift Helvetica (WinAnsi, € enthalten).
export function renderInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `${d.kind === 'invoice' ? 'Rechnung' : 'Stornorechnung'} ${d.number}`, Author: d.seller.name } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const W = doc.page.width - M * 2;
        const right = (text: string, y: number, opts: PDFKit.Mixins.TextOptions = {}) => doc.text(text, M, y, { width: W, align: 'right', ...opts });

        // Kopf: Verkaeufer
        doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(d.seller.name, M, M, { width: W / 2 });
        doc.font('Helvetica').fontSize(9).fillColor(MUTED);
        right([d.seller.name, ...d.seller.address.split(/,\s*|\n/), d.seller.email].join('\n'), M);

        // Empfaenger
        let y = 150;
        doc.fontSize(7).fillColor(MUTED).text(`${d.seller.name} · ${d.seller.address.replace(/\n/g, ', ')}`, M, y - 14, { width: W / 2 });
        doc.fontSize(10).fillColor(INK).text([d.buyer.name, d.buyer.address].filter(Boolean).join('\n') || 'Kundin / Kunde laut Bestellung', M, y, { width: W / 2 });

        // Titel + Eckdaten
        y = 250;
        doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(d.kind === 'invoice' ? 'Rechnung' : 'Stornorechnung', M, y);
        y += 30;
        const meta: [string, string][] = [
            [d.kind === 'invoice' ? 'Rechnungsnummer' : 'Stornonummer', d.number],
            ...(d.correctsNumber ? [['Zu Rechnung', d.correctsNumber] as [string, string]] : []),
            ['Datum', formatDate(d.issuedAt)],
            ['Leistungsdatum', d.serviceDate],
            ['Bestellnummer', d.orderNo],
        ];
        doc.fontSize(9);
        for (const [k, v] of meta) {
            doc.font('Helvetica').fillColor(MUTED).text(k, M, y, { width: 110 });
            doc.font('Helvetica').fillColor(INK).text(v, M + 110, y, { width: W - 110 });
            y += 14;
        }

        // Positionen
        y += 16;
        const cols = { qty: M, title: M + 34, vat: M + W - 200, unit: M + W - 150, total: M + W - 75 };
        const header = () => {
            doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
            doc.text('Menge', cols.qty, y, { width: 30 });
            doc.text('Artikel', cols.title, y, { width: cols.vat - cols.title - 8 });
            doc.text('MwSt', cols.vat, y, { width: 40, align: 'right' });
            doc.text('Einzelpreis', cols.unit, y, { width: 70, align: 'right' });
            doc.text('Gesamt', cols.total, y, { width: 75, align: 'right' });
            y += 14;
            doc.moveTo(M, y - 3).lineTo(M + W, y - 3).strokeColor(LINE).lineWidth(0.5).stroke();
        };
        header();
        const row = (qty: string, title: string, sub: string | undefined, vat: string, unit: string, total: string) => {
            doc.font('Helvetica').fontSize(9);
            const titleW = cols.vat - cols.title - 8;
            const h = Math.max(doc.heightOfString(title, { width: titleW }) + (sub ? 11 : 0), 12) + 6;
            if (y + h > doc.page.height - 160) { doc.addPage(); y = M; header(); }
            doc.fillColor(INK).text(qty, cols.qty, y, { width: 30 });
            doc.text(title, cols.title, y, { width: titleW });
            if (sub) doc.fontSize(7).fillColor(MUTED).text(sub, cols.title, doc.y, { width: titleW }).fontSize(9).fillColor(INK);
            doc.text(vat, cols.vat, y, { width: 40, align: 'right' });
            doc.text(unit, cols.unit, y, { width: 70, align: 'right' });
            doc.text(total, cols.total, y, { width: 75, align: 'right' });
            y += h;
        };
        for (const l of d.lines) row(`${l.quantity}×`, l.title, l.sku, `${l.vatRate} %`, euro(l.unitGrossCents), euro(l.grossCents));
        if (d.shippingCents) row('', 'Versand', 'anteilig nach Steuersatz der Artikel', '', '', euro(d.shippingCents));

        // Summen je Steuersatz
        y += 6;
        doc.moveTo(M + W / 2, y).lineTo(M + W, y).strokeColor(LINE).lineWidth(0.5).stroke();
        y += 8;
        const sum = (label: string, value: string, bold = false) => {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(bold ? INK : MUTED);
            doc.text(label, M + W / 2, y, { width: W / 2 - 80 });
            doc.fillColor(INK).text(value, M + W - 80, y, { width: 80, align: 'right' });
            y += bold ? 18 : 13;
        };
        for (const r of d.breakdown.rows) {
            sum(`Netto ${r.rate} %`, euro(r.netCents));
            sum(`MwSt ${r.rate} %`, euro(r.vatCents));
        }
        y += 4;
        sum(d.kind === 'invoice' ? 'Gesamtbetrag' : 'Erstattungsbetrag', euro(d.breakdown.grossCents), true);

        y += 14;
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(d.paymentNote, M, y, { width: W });

        // Fuss auf jeder Seite: Pflichtangaben Verkaeufer
        const tax = d.seller.vatId ? `USt-IdNr. ${d.seller.vatId}` : d.seller.taxNumber ? `Steuernummer ${d.seller.taxNumber}` : '';
        const footer = [d.seller.name, d.seller.address.replace(/\n/g, ', '), d.seller.email, tax].filter(Boolean).join(' · ');
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            // unterhalb des Rands schreiben, ohne dass pdfkit eine neue Seite anfaengt
            doc.page.margins.bottom = 0;
            doc.font('Helvetica').fontSize(7).fillColor(MUTED)
                .text(footer, M, doc.page.height - M - 10, { width: W, align: 'center', lineBreak: false });
        }
        doc.end();
    });
}
