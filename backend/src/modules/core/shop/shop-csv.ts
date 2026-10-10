import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateProductDto } from './dto/admin-product.dto';
import type { ShopFulfillment } from './shop.constants';

export const CSV_MAX_ROWS = 2000;
const REQUIRED = ['sku', 'title', 'category', 'fulfillment', 'price'] as const;
const KNOWN = new Set([...REQUIRED, 'description', 'vat_rate', 'stock', 'unlock_target', 'image_url', 'active']);

export interface CsvRowError {
    line: number;
    message: string;
}

// Regeln ueber mehrere Felder — gelten fuer Formular und Import gleich
export function productRuleError(p: { fulfillment: ShopFulfillment; unlock_target?: string | null; stock?: number | null }): string | null {
    if (p.unlock_target && p.fulfillment !== 'unlock') return 'Freischaltung gibt es nur bei Art unlock';
    if (p.fulfillment === 'license' && p.stock != null) return 'Lizenzen zählen freie Keys, keinen Bestand — Bestand (stock) leer lassen';
    return null;
}

// RFC-4180-artig: Anfuehrungszeichen, "" als Escape, Zeilenumbrueche in Feldern,
// CRLF, BOM. Trenner aus der Kopfzeile: Excel auf Deutsch schreibt ';'.
export function parseCsv(text: string): string[][] {
    const src = text.replace(/^﻿/, '');
    const firstLine = src.slice(0, src.search(/\r?\n|$/));
    const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
            if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"' && field === '') quoted = true;
        else if (c === delimiter) { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    // Leerzeilen (auch ";;;" aus Excel) ignorieren
    return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// "39,90" / "39.90" / "1.234,50 €" -> Cent; null wenn keine oder keine eindeutige Zahl
export function parsePriceCents(raw: string): number | null {
    let s = raw.replace(/[\s€]/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    // "12,345" ohne Dezimalteil ist mehrdeutig (12,35 € oder 12.345 €?) — lieber ablehnen
    else if (s.includes(',') && !s.includes('.')) return null;
    else s = s.replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    return Math.round(Number(s) * 100);
}

function parseBool(raw: string): boolean | undefined {
    const s = raw.trim().toLowerCase();
    if (s === '') return undefined;
    if (['1', 'true', 'ja', 'yes', 'x'].includes(s)) return true;
    if (['0', 'false', 'nein', 'no'].includes(s)) return false;
    return undefined;
}

export interface CsvImportResult {
    products: CreateProductDto[];
    // Zeile in der Datei je Artikel (gleicher Index wie products)
    lines: number[];
    errors: CsvRowError[];
    // Spalten aus der Kopfzeile — beim Aktualisieren werden nur diese ueberschrieben
    columns: string[];
}

// Zeilen -> gepruefte Artikel. Zeilennummern wie in Excel (Kopfzeile = 1).
export function csvToProducts(text: string): CsvImportResult {
    const rows = parseCsv(text);
    if (rows.length === 0) return { products: [], lines: [], errors: [{ line: 1, message: 'Datei ist leer' }], columns: [] };

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const missing = REQUIRED.filter((c) => !header.includes(c));
    if (missing.length) return { products: [], lines: [], errors: [{ line: 1, message: `Spalten fehlen: ${missing.join(', ')}` }], columns: header };
    const unknown = header.filter((h) => h && !KNOWN.has(h));
    if (unknown.length) return { products: [], lines: [], errors: [{ line: 1, message: `Unbekannte Spalten: ${unknown.join(', ')}` }], columns: header };
    if (rows.length - 1 > CSV_MAX_ROWS) return { products: [], lines: [], errors: [{ line: 1, message: `Höchstens ${CSV_MAX_ROWS} Zeilen pro Import` }], columns: header };

    const products: CreateProductDto[] = [];
    const lines: number[] = [];
    const errors: CsvRowError[] = [];
    const seen = new Map<string, number>();

    rows.slice(1).forEach((cells, i) => {
        const line = i + 2;
        const get = (col: string) => (cells[header.indexOf(col)] ?? '').trim();
        if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim())) {
            errors.push({ line, message: 'Mehr Felder als Spalten — Trennzeichen im Text in Anführungszeichen setzen' });
            return;
        }

        const price = parsePriceCents(get('price'));
        if (price === null) { errors.push({ line, message: `Preis „${get('price')}“ ist keine Zahl` }); return; }
        const fulfillment = get('fulfillment').toLowerCase();
        const vat = get('vat_rate');
        const stock = get('stock');
        const active = get('active');
        if (active && parseBool(active) === undefined) { errors.push({ line, message: `active „${active}“: ja/nein erwartet` }); return; }

        const raw = {
            sku: get('sku'),
            title: get('title'),
            description: get('description') || undefined,
            category: get('category').toLowerCase(),
            fulfillment,
            price_cents: price,
            // Essen 7 %, sonst 19 %, wenn die Spalte leer ist
            vat_rate: vat ? Number(vat.replace(',', '.').replace('%', '')) : fulfillment === 'food' ? 7 : 19,
            stock: stock ? Number(stock) : null,
            unlock_target: get('unlock_target') || null,
            image_url: get('image_url') || null,
            active: parseBool(active),
        };
        const dto = plainToInstance(CreateProductDto, raw);
        const invalid = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
        if (invalid.length) {
            errors.push({ line, message: invalid.map((e) => `${e.property}: ${Object.values(e.constraints ?? {})[0] ?? 'ungültig'}`).join('; ') });
            return;
        }
        const rule = productRuleError(dto);
        if (rule) { errors.push({ line, message: rule }); return; }
        const first = seen.get(dto.sku);
        if (first) { errors.push({ line, message: `SKU ${dto.sku} steht schon in Zeile ${first}` }); return; }
        seen.set(dto.sku, line);
        products.push(dto);
        lines.push(line);
    });
    return { products, lines, errors, columns: header };
}
