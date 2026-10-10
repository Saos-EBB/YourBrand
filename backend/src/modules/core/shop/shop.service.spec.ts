import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { buildProductFilter } from './shop.service';
import { ListProductsQuery } from './dto/list-products.query';

// Wie die globale ValidationPipe (transform + whitelist + forbidNonWhitelisted)
function parse(raw: Record<string, string>) {
    const query = plainToInstance(ListProductsQuery, raw);
    const errors = validateSync(query, { whitelist: true, forbidNonWhitelisted: true });
    return { query, errors: errors.map((e) => e.property) };
}

describe('buildProductFilter', () => {
    it('ohne Filter: nur aktive Artikel, neueste zuerst', () => {
        expect(buildProductFilter({})).toEqual({ where: 'p.active', params: [], orderBy: 'p.created_at DESC, p.id' });
    });

    it('nummeriert die Parameter in der Reihenfolge der Filter', () => {
        const { query } = parse({ category: 'merch', minPrice: '500', maxPrice: '2000', minRating: '4' });
        const { where, params } = buildProductFilter(query);
        expect(where).toBe('p.active AND p.category = $1 AND p.price_cents >= $2 AND p.price_cents <= $3 AND p.rating_avg >= $4');
        expect(params).toEqual(['merch', 500, 2000, 4]);
    });

    it('Suche: % und _ aus der Eingabe gelten als Text', () => {
        const { where, params } = buildProductFilter({ q: ' 50%_rabatt ' });
        expect(where).toBe('p.active AND p.title ILIKE $1');
        expect(params).toEqual(['%50\\%\\_rabatt%']);
    });

    it('inStock haengt die Lieferbarkeit an, ohne Parameter', () => {
        const { query } = parse({ inStock: 'true' });
        const { where, params } = buildProductFilter(query);
        expect(where).toContain("p.fulfillment <> 'license'");
        expect(params).toEqual([]);
        expect(buildProductFilter(parse({ inStock: 'false' }).query).where).toBe('p.active');
    });

    it('Sortierung nur aus der festen Liste', () => {
        expect(buildProductFilter({ sort: 'price_desc' }).orderBy).toBe('p.price_cents DESC, p.id');
        expect(buildProductFilter({ sort: 'rating' }).orderBy).toBe('p.rating_avg DESC, p.rating_count DESC, p.id');
    });
});

describe('ListProductsQuery', () => {
    it('lehnt unbekannte Sortierung, Art und Felder ab', () => {
        expect(parse({ sort: 'id; DROP TABLE shop_products' }).errors).toEqual(['sort']);
        expect(parse({ fulfillment: 'gold' }).errors).toEqual(['fulfillment']);
        expect(parse({ orderBy: 'title' }).errors).toEqual(['orderBy']);
    });

    it('Grenzen: Bewertung 1-5, Seite bis 100, Seitengroesse bis 60, keine negativen Preise', () => {
        expect(parse({ minRating: '6' }).errors).toEqual(['minRating']);
        expect(parse({ page: '101' }).errors).toEqual(['page']);
        expect(parse({ limit: '61' }).errors).toEqual(['limit']);
        expect(parse({ minPrice: '-1' }).errors).toEqual(['minPrice']);
        expect(parse({ minPrice: 'abc' }).errors).toEqual(['minPrice']);
        expect(parse({ minRating: '5', page: '100', limit: '60', minPrice: '0' }).errors).toEqual([]);
    });
});
