import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max,
    MaxLength, Min,
} from 'class-validator';
import { SHOP_FULFILLMENTS, SHOP_VAT_RATES } from '../shop.constants';
import type { ShopFulfillment } from '../shop.constants';

export const SKU_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;
// Kategorie als Slug, die Anzeige macht daraus "In App" usw.
export const CATEGORY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Was ein Code in der App freischaltet: 'premium:30', 'coins:500'
export const UNLOCK_TARGET_PATTERN = /^[a-z][a-z0-9_]*:[0-9]{1,6}$/;
export const SHOP_PRICE_CENTS_MAX = 1_000_000;
export const SHOP_CSV_MAX_CHARS = 95_000;

// Felder, die man nach dem Anlegen aendern darf. SKU und Art bleiben fest:
// SKU ist der Schluessel fuer den CSV-Import, an der Art haengen Bestellungen.
export class UpdateProductDto {
    @IsOptional() @IsString() @Length(2, 120)
    title?: string;

    @IsOptional() @IsString() @MaxLength(4000)
    description?: string;

    @IsOptional() @IsString() @Length(1, 40) @Matches(CATEGORY_PATTERN, { message: 'Kategorie: nur a-z, 0-9 und Bindestrich' })
    category?: string;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(SHOP_PRICE_CENTS_MAX)
    price_cents?: number;

    @IsOptional() @Type(() => Number) @IsIn(SHOP_VAT_RATES)
    vat_rate?: number;

    // null = unbegrenzt
    @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000)
    stock?: number | null;

    @IsOptional() @IsString() @Matches(UNLOCK_TARGET_PATTERN, { message: 'Freischaltung wie premium:30 oder coins:500' })
    unlock_target?: string | null;

    @IsOptional() @IsString() @MaxLength(500) @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Bild-URL muss mit https:// beginnen' })
    image_url?: string | null;

    @IsOptional() @IsBoolean()
    active?: boolean;
}

// Getrennt von UpdateProductDto ausgeschrieben: geerbte @IsOptional wuerden
// die Pflichtfelder sonst wieder optional machen
export class CreateProductDto {
    @IsString() @Matches(SKU_PATTERN, { message: 'SKU: 1–40 Zeichen, A-Z, 0-9, Punkt, Minus, Unterstrich' })
    sku!: string;

    @IsIn(SHOP_FULFILLMENTS)
    fulfillment!: ShopFulfillment;

    @IsString() @Length(2, 120)
    title!: string;

    @IsOptional() @IsString() @MaxLength(4000)
    description?: string;

    @IsString() @Length(1, 40) @Matches(CATEGORY_PATTERN, { message: 'Kategorie: nur a-z, 0-9 und Bindestrich' })
    category!: string;

    @Type(() => Number) @IsInt() @Min(1) @Max(SHOP_PRICE_CENTS_MAX)
    price_cents!: number;

    @IsOptional() @Type(() => Number) @IsIn(SHOP_VAT_RATES)
    vat_rate?: number;

    @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000)
    stock?: number | null;

    @IsOptional() @IsString() @Matches(UNLOCK_TARGET_PATTERN, { message: 'Freischaltung wie premium:30 oder coins:500' })
    unlock_target?: string | null;

    @IsOptional() @IsString() @MaxLength(500) @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Bild-URL muss mit https:// beginnen' })
    image_url?: string | null;

    @IsOptional() @IsBoolean()
    active?: boolean;
}

export class AdminListProductsQuery {
    @IsOptional() @IsString() @MaxLength(80)
    q?: string;

    @IsOptional() @IsIn(SHOP_FULFILLMENTS)
    fulfillment?: ShopFulfillment;

    // 'all' | 'active' | 'inactive'
    @IsOptional() @IsIn(['all', 'active', 'inactive'])
    status?: 'all' | 'active' | 'inactive';

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
    page?: number;
}

export class ImportProductsDto {
    // CSV als Text. Express nimmt JSON nur bis 100 KB an (main.ts setzt kein
    // eigenes Limit) — knapp darunter bleiben, groessere Dateien aufteilen
    @IsString() @MaxLength(SHOP_CSV_MAX_CHARS, { message: 'Datei zu groß — bitte in Teile unter 95 KB aufteilen' })
    csv!: string;

    @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
    dryRun?: boolean;
}

export class AddCodesDto {
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @IsString({ each: true }) @Length(4, 200, { each: true })
    codes!: string[];
}
