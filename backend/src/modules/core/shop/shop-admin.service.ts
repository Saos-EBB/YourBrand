import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import { encryptField } from '../../../common/crypto/crypto.helper';
import { AdminListProductsQuery, CreateProductDto, UpdateProductDto } from './dto/admin-product.dto';
import { csvToProducts, productRuleError, type CsvRowError } from './shop-csv';
import type { ShopFulfillment } from './shop.constants';

const ADMIN_PAGE_SIZE = 50;

// Spalten, die Formular und Import schreiben duerfen (sku/fulfillment nur beim Anlegen)
const EDITABLE = ['title', 'description', 'category', 'price_cents', 'vat_rate', 'stock', 'unlock_target', 'image_url', 'active'] as const;
type Editable = (typeof EDITABLE)[number];
// CSV-Spalte -> DB-Spalte, wo sie abweichen
const CSV_COLUMN: Partial<Record<Editable, string>> = { price_cents: 'price' };

const ADMIN_COLUMNS = `p.id, p.sku, p.title, p.description, p.category, p.fulfillment, p.unlock_target, p.price_cents,
    p.vat_rate::float AS vat_rate, p.stock, p.image_url, p.active, p.rating_avg::float AS rating_avg, p.rating_count,
    p.created_at, p.updated_at,
    CASE WHEN p.fulfillment = 'license' THEN (SELECT count(*)::int FROM shop_codes c
        WHERE c.product_id = p.id AND c.assigned_at IS NULL AND c.revoked_at IS NULL) END AS free_codes`;

// Suche nach einem Key, ohne ihn im Klartext zu speichern (Einloesen, Doppelte)
export function hashShopCode(code: string): string {
    if (!process.env.APP_ENCRYPTION_KEY) throw new Error('APP_ENCRYPTION_KEY not set');
    return createHmac('sha256', process.env.APP_ENCRYPTION_KEY).update(code.trim()).digest('hex');
}

function defaultVat(f: ShopFulfillment): number {
    return f === 'food' ? 7 : 19;
}

@Injectable()
export class ShopAdminService {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    async listProducts(query: AdminListProductsQuery) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (query.q?.trim()) {
            params.push(`%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`);
            conditions.push(`(p.title ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
        }
        if (query.fulfillment) { params.push(query.fulfillment); conditions.push(`p.fulfillment = $${params.length}`); }
        if (query.status === 'active') conditions.push('p.active');
        if (query.status === 'inactive') conditions.push('NOT p.active');
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const page = query.page ?? 1;

        const [items, [{ total }], categories] = await Promise.all([
            this.dataSource.query(
                `SELECT ${ADMIN_COLUMNS} FROM shop_products p ${where}
                  ORDER BY p.updated_at DESC, p.id LIMIT ${ADMIN_PAGE_SIZE} OFFSET $${params.length + 1}`,
                [...params, (page - 1) * ADMIN_PAGE_SIZE],
            ),
            this.dataSource.query(`SELECT count(*)::int AS total FROM shop_products p ${where}`, params),
            this.dataSource.query(`SELECT DISTINCT category FROM shop_products ORDER BY category`),
        ]);
        return { items, total, page, limit: ADMIN_PAGE_SIZE, categories: categories.map((c: { category: string }) => c.category) };
    }

    async createProduct(dto: CreateProductDto) {
        const rule = productRuleError(dto);
        if (rule) throw new BadRequestException(rule);
        try {
            const [row] = await this.dataSource.query(
                `INSERT INTO shop_products (sku, title, description, category, fulfillment, price_cents, vat_rate, stock,
                        unlock_target, image_url, active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                [dto.sku, dto.title.trim(), dto.description?.trim() ?? '', dto.category, dto.fulfillment, dto.price_cents,
                    dto.vat_rate ?? defaultVat(dto.fulfillment), dto.stock ?? null, dto.unlock_target ?? null,
                    dto.image_url ?? null, dto.active ?? true],
            );
            return this.getProduct(row.id);
        } catch (err: any) {
            if (err?.code === '23505') throw new ConflictException(`SKU ${dto.sku} gibt es schon`);
            throw err;
        }
    }

    async updateProduct(id: string, dto: UpdateProductDto) {
        const [current] = await this.dataSource.query(
            'SELECT fulfillment, stock, unlock_target FROM shop_products WHERE id = $1', [id],
        );
        if (!current) throw new NotFoundException('Artikel nicht gefunden');
        // Nur Felder, die wirklich mitgeschickt wurden — null heisst "leeren"
        const keys = EDITABLE.filter((k) => k in dto && dto[k] !== undefined);
        if (keys.length === 0) return this.getProduct(id);
        const changes = Object.fromEntries(keys.map((k) => [k, dto[k]]));
        const rule = productRuleError({ ...current, ...changes });
        if (rule) throw new BadRequestException(rule);

        const values = keys.map((k) => (typeof dto[k] === 'string' && k !== 'unlock_target' ? (dto[k] as string).trim() : dto[k]));
        await this.dataSource.query(
            `UPDATE shop_products SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
            [id, ...values],
        );
        return this.getProduct(id);
    }

    // Alles oder nichts: mit Fehlern oder als Probelauf wird nichts geschrieben.
    // Schluessel ist die SKU; vorhandene Artikel bekommen nur die Spalten aus der Datei.
    async importCsv(csv: string, dryRun: boolean): Promise<{ created: number; updated: number; errors: CsvRowError[]; written: boolean }> {
        const { products, lines, errors, columns } = csvToProducts(csv);
        const existing = new Map<string, ShopFulfillment>();
        if (products.length) {
            const rows: { sku: string; fulfillment: ShopFulfillment }[] = await this.dataSource.query(
                'SELECT sku, fulfillment FROM shop_products WHERE sku = ANY($1)', [products.map((p) => p.sku)],
            );
            rows.forEach((r) => existing.set(r.sku, r.fulfillment));
        }
        products.forEach((p, i) => {
            const had = existing.get(p.sku);
            if (had && had !== p.fulfillment) {
                errors.push({ line: lines[i], message: `SKU ${p.sku} ist schon als ${had} angelegt — die Art lässt sich nicht ändern` });
            }
        });
        errors.sort((a, b) => a.line - b.line);
        const updated = products.filter((p) => existing.has(p.sku)).length;
        const result = { created: products.length - updated, updated, errors };
        if (errors.length || dryRun || products.length === 0) return { ...result, written: false };

        const updateKeys = EDITABLE.filter((k) => columns.includes(CSV_COLUMN[k] ?? k));
        await this.dataSource.transaction(async (tx) => {
            for (const p of products) {
                await tx.query(
                    `INSERT INTO shop_products (sku, title, description, category, fulfillment, price_cents, vat_rate, stock,
                            unlock_target, image_url, active)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     ON CONFLICT (sku) DO UPDATE SET ${updateKeys.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}, updated_at = now()`,
                    [p.sku, p.title, p.description ?? '', p.category, p.fulfillment, p.price_cents,
                        p.vat_rate ?? defaultVat(p.fulfillment), p.stock ?? null, p.unlock_target ?? null,
                        p.image_url ?? null, p.active ?? true],
                );
            }
        });
        return { ...result, written: true };
    }

    // Keys verschluesselt ablegen; schon vorhandene (auch bei anderen Artikeln) werden uebersprungen
    async addCodes(productId: string, codes: string[]): Promise<{ added: number; duplicates: number; free: number }> {
        const [product] = await this.dataSource.query('SELECT fulfillment FROM shop_products WHERE id = $1', [productId]);
        if (!product) throw new NotFoundException('Artikel nicht gefunden');
        if (product.fulfillment !== 'license') throw new BadRequestException('Keys gibt es nur bei Lizenz-Artikeln');

        const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
        let added = 0;
        await this.dataSource.transaction(async (tx) => {
            for (const code of unique) {
                const rows = await tx.query(
                    `INSERT INTO shop_codes (product_id, code_encrypted, code_hash) VALUES ($1, $2, $3)
                     ON CONFLICT (code_hash) DO NOTHING RETURNING id`,
                    [productId, encryptField(code), hashShopCode(code)],
                );
                added += rows.length;
            }
            await tx.query('UPDATE shop_products SET updated_at = now() WHERE id = $1', [productId]);
        });
        const [{ free }] = await this.dataSource.query(
            `SELECT count(*)::int AS free FROM shop_codes WHERE product_id = $1 AND assigned_at IS NULL AND revoked_at IS NULL`,
            [productId],
        );
        return { added, duplicates: codes.length - added, free };
    }

    private async getProduct(id: string) {
        const [row] = await this.dataSource.query(`SELECT ${ADMIN_COLUMNS} FROM shop_products p WHERE p.id = $1`, [id]);
        if (!row) throw new NotFoundException('Artikel nicht gefunden');
        return row;
    }
}
