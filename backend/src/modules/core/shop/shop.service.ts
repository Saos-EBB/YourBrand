import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ListProductsQuery } from './dto/list-products.query';
import { CreateReviewDto } from './dto/create-review.dto';
import { SHOP_BOUGHT_STATUSES } from './shop.constants';
import type { ShopFulfillment, ShopSort } from './shop.constants';

export interface ShopProduct {
    id: string;
    sku: string;
    title: string;
    description: string;
    category: string;
    fulfillment: ShopFulfillment;
    price_cents: number;
    vat_rate: number;
    image_url: string | null;
    rating_avg: number;
    rating_count: number;
    in_stock: boolean;
}

export interface ShopReview {
    rating: number;
    body: string | null;
    created_at: string;
    nickname: string | null;
    mine: boolean;
}

// Lieferbar: Merch mit Bestand, Lizenzen mit freiem Key; Essen und Codes immer
const IN_STOCK_SQL = `((p.stock IS NULL OR p.stock > 0) AND (p.fulfillment <> 'license' OR EXISTS (
    SELECT 1 FROM shop_codes c WHERE c.product_id = p.id AND c.assigned_at IS NULL AND c.revoked_at IS NULL)))`;

// Feste Liste statt Nutzereingabe im SQL; id als Tiebreaker, damit Seiten stabil bleiben
const ORDER_BY: Record<ShopSort, string> = {
    price_asc: 'p.price_cents ASC, p.id',
    price_desc: 'p.price_cents DESC, p.id',
    rating: 'p.rating_avg DESC, p.rating_count DESC, p.id',
    newest: 'p.created_at DESC, p.id',
};

const PRODUCT_COLUMNS = `p.id, p.sku, p.title, p.description, p.category, p.fulfillment, p.price_cents,
    p.vat_rate::float AS vat_rate, p.image_url, p.rating_avg::float AS rating_avg, p.rating_count,
    ${IN_STOCK_SQL} AS in_stock`;

// WHERE, Parameter und ORDER BY fuer die Artikelliste — reine Funktion, damit
// die Filterlogik ohne DB testbar ist
export function buildProductFilter(query: ListProductsQuery): { where: string; params: unknown[]; orderBy: string } {
    const conditions = ['p.active'];
    const params: unknown[] = [];
    const add = (sql: (n: string) => string, value: unknown) => {
        params.push(value);
        conditions.push(sql(`$${params.length}`));
    };
    if (query.q?.trim()) {
        // % und _ aus der Eingabe sind Text, keine Platzhalter
        add((n) => `p.title ILIKE ${n}`, `%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (query.category) add((n) => `p.category = ${n}`, query.category);
    if (query.fulfillment) add((n) => `p.fulfillment = ${n}`, query.fulfillment);
    if (query.minPrice !== undefined) add((n) => `p.price_cents >= ${n}`, query.minPrice);
    if (query.maxPrice !== undefined) add((n) => `p.price_cents <= ${n}`, query.maxPrice);
    if (query.minRating !== undefined) add((n) => `p.rating_avg >= ${n}`, query.minRating);
    if (query.inStock) conditions.push(IN_STOCK_SQL);
    // Lieferbares zuerst, innerhalb davon die gewaehlte Sortierung
    return { where: conditions.join(' AND '), params, orderBy: `${IN_STOCK_SQL} DESC, ${ORDER_BY[query.sort ?? 'newest']}` };
}

@Injectable()
export class ShopService {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    // Facetten (Kategorien, Preisspanne) ueber alle aktiven Artikel, nicht
    // ueber die gefilterten — sonst verschwinden Optionen beim Filtern
    async listProducts(query: ListProductsQuery) {
        const { where, params, orderBy } = buildProductFilter(query);
        const limit = query.limit ?? 24;
        const offset = ((query.page ?? 1) - 1) * limit;
        const [items, [{ total }], categories, [range]] = await Promise.all([
            this.dataSource.query(
                `SELECT ${PRODUCT_COLUMNS} FROM shop_products p WHERE ${where}
                  ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset],
            ) as Promise<ShopProduct[]>,
            this.dataSource.query(`SELECT count(*)::int AS total FROM shop_products p WHERE ${where}`, params),
            this.dataSource.query(
                `SELECT category, count(*)::int AS count FROM shop_products WHERE active GROUP BY category ORDER BY category`,
            ),
            this.dataSource.query(
                `SELECT min(price_cents)::int AS min, max(price_cents)::int AS max FROM shop_products WHERE active`,
            ),
        ]);
        return { items, total, page: query.page ?? 1, limit, facets: { categories, priceMin: range.min, priceMax: range.max } };
    }

    async getProduct(userId: string, id: string) {
        const [product] = await this.dataSource.query(
            `SELECT ${PRODUCT_COLUMNS} FROM shop_products p WHERE p.id = $1 AND p.active`,
            [id],
        );
        if (!product) throw new NotFoundException('Artikel nicht gefunden');
        const [reviews, canReview] = await Promise.all([
            this.dataSource.query(
                `SELECT r.rating, r.body, r.created_at, pr.nickname, r.user_id = $2 AS mine
                   FROM shop_reviews r LEFT JOIN profiles pr ON pr.user_id = r.user_id
                  WHERE r.product_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
                [id, userId],
            ) as Promise<ShopReview[]>,
            this.hasBought(userId, id),
        ]);
        return { ...(product as ShopProduct), reviews, can_review: canReview };
    }

    // Eine Bewertung pro Kaeufer und Artikel; nochmal bewerten ueberschreibt
    async upsertReview(userId: string, productId: string, dto: CreateReviewDto): Promise<void> {
        const [product] = await this.dataSource.query('SELECT 1 FROM shop_products WHERE id = $1 AND active', [productId]);
        if (!product) throw new NotFoundException('Artikel nicht gefunden');
        if (!(await this.hasBought(userId, productId))) {
            throw new ForbiddenException('Bewerten können nur Käufer dieses Artikels');
        }
        await this.dataSource.query(
            `INSERT INTO shop_reviews (product_id, user_id, rating, body) VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now()`,
            [productId, userId, dto.rating, dto.body?.trim() || null],
        );
    }

    private async hasBought(userId: string, productId: string): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT 1 FROM shop_orders o JOIN shop_order_items i ON i.order_id = o.id
              WHERE o.user_id = $1 AND i.product_id = $2 AND o.status = ANY($3) LIMIT 1`,
            [userId, productId, SHOP_BOUGHT_STATUSES],
        );
        return rows.length > 0;
    }
}
