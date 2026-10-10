import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { csvToProducts, parseCsv, parsePriceCents, productRuleError } from './shop-csv';
import { CreateProductDto, UpdateProductDto } from './dto/admin-product.dto';

describe('parseCsv', () => {
    it('erkennt ; aus deutschem Excel, BOM, CRLF und Leerzeilen', () => {
        expect(parseCsv('﻿sku;title\r\nA-1;Hoodie\r\n;;\r\n\r\nA-2;Tasse\r\n')).toEqual([['sku', 'title'], ['A-1', 'Hoodie'], ['A-2', 'Tasse']]);
    });

    it('Anfuehrungszeichen: Trenner, "" und Zeilenumbruch im Feld', () => {
        expect(parseCsv('sku,title\nA,"Pizza, groß ""XL""\nmit Rand"')).toEqual([['sku', 'title'], ['A', 'Pizza, groß "XL"\nmit Rand']]);
    });
});

describe('parsePriceCents', () => {
    it.each([['39,90', 3990], ['39.90', 3990], ['1.234,50 €', 123450], ['1,234.50', 123450], ['5', 500], ['0,5', 50]])('%s -> %i', (raw, cents) => {
        expect(parsePriceCents(raw)).toBe(cents);
    });
    it.each(['', 'abc', '12,345', '-3', '1.2.3'])('%s ist kein Preis', (raw) => {
        expect(parsePriceCents(raw)).toBeNull();
    });
});

describe('productRuleError', () => {
    it('Freischaltung nur bei unlock, Lizenzen ohne Bestand', () => {
        expect(productRuleError({ fulfillment: 'physical', unlock_target: 'coins:500' })).toMatch(/nur bei Art unlock/);
        expect(productRuleError({ fulfillment: 'license', stock: 3 })).toMatch(/freie Keys/);
        expect(productRuleError({ fulfillment: 'license', stock: null })).toBeNull();
        expect(productRuleError({ fulfillment: 'unlock', unlock_target: 'premium:30' })).toBeNull();
    });
});

describe('csvToProducts', () => {
    const HEAD = 'sku;title;category;fulfillment;price;vat_rate;stock;unlock_target;active';

    it('gueltige Zeilen werden zu Artikeln, MwSt nach Art vorbelegt', () => {
        const { products, errors, lines, columns } = csvToProducts([
            HEAD,
            'P-1;Pizza Kiez;pizza;food;12,90;;;;',
            'M-1;Hoodie;merch;physical;39,90;19;25;;ja',
            'C-1;Coins 500;In-App;unlock;4,99;;;coins:500;nein',
        ].join('\n'));
        expect(errors).toEqual([]);
        expect(lines).toEqual([2, 3, 4]);
        expect(columns).toContain('unlock_target');
        expect(products.map((p) => [p.sku, p.price_cents, p.vat_rate, p.stock, p.category, p.active])).toEqual([
            ['P-1', 1290, 7, null, 'pizza', undefined],
            ['M-1', 3990, 19, 25, 'merch', true],
            ['C-1', 499, 19, null, 'in-app', false],
        ]);
    });

    it('meldet jede kaputte Zeile mit Excel-Zeilennummer', () => {
        const { products, errors } = csvToProducts([
            HEAD,
            'OK-1;Tasse;merch;physical;9,90;;10;;',
            'X-1;Tasse;merch;physical;neun;;;;',
            'X-2;T;merch;physical;9,90;;;;',
            'X-3;Shirt;merch;drohne;9,90;;;;',
            'X-4;Key;software;license;19,90;;5;;',
            'X-5;Shirt;merch;physical;9,90;16;;;',
            'OK-1;Doppelt;merch;physical;9,90;;;;',
        ].join('\n'));
        expect(products.map((p) => p.sku)).toEqual(['OK-1']);
        expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8]);
        expect(errors[0].message).toMatch(/keine Zahl/);
        expect(errors[1].message).toMatch(/^title:/);
        expect(errors[2].message).toMatch(/^fulfillment:/);
        expect(errors[3].message).toMatch(/freie Keys/);
        expect(errors[4].message).toMatch(/^vat_rate:/);
        expect(errors[5].message).toMatch(/schon in Zeile 2/);
    });

    it('Kopfzeile: Pflichtspalten und unbekannte Spalten', () => {
        expect(csvToProducts('sku;title\nA;B').errors[0].message).toMatch(/Spalten fehlen: category, fulfillment, price/);
        expect(csvToProducts(`${HEAD};preis_alt\nA;B;c;food;1;;;;;`).errors[0].message).toMatch(/Unbekannte Spalten: preis_alt/);
        expect(csvToProducts('').errors[0].message).toMatch(/leer/);
    });

    it('Bild-URL nur https', () => {
        const { errors } = csvToProducts('sku;title;category;fulfillment;price;image_url\nA;Hoodie;merch;physical;9;javascript:alert(1)');
        expect(errors[0].message).toMatch(/https/);
    });
});

describe('Admin-DTOs', () => {
    const errors = (cls: any, raw: object) => validateSync(plainToInstance(cls, raw), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);

    it('Anlegen: Pflichtfelder, keine Bewertung oder ID von aussen', () => {
        expect(errors(CreateProductDto, { sku: 'A', fulfillment: 'food', title: 'Pizza', category: 'pizza', price_cents: 990 })).toEqual([]);
        expect(errors(CreateProductDto, { sku: 'A', fulfillment: 'food', title: 'Pizza', category: 'pizza' })).toEqual(['price_cents']);
        expect(errors(CreateProductDto, { sku: 'A B', fulfillment: 'food', title: 'Pizza', category: 'Pizza Neu', price_cents: 990, rating_avg: 5 }))
            .toEqual(expect.arrayContaining(['sku', 'category', 'rating_avg']));
    });

    it('Bearbeiten: SKU und Art fest, stock null erlaubt', () => {
        expect(errors(UpdateProductDto, { stock: null, unlock_target: null, image_url: null })).toEqual([]);
        expect(errors(UpdateProductDto, { sku: 'NEU', fulfillment: 'food' })).toEqual(['sku', 'fulfillment']);
        expect(plainToInstance(UpdateProductDto, { stock: null }).stock).toBeNull();
    });
});
