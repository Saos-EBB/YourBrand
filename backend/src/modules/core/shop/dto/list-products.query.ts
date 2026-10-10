import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SHOP_FULFILLMENTS, SHOP_PAGE_SIZE_MAX, SHOP_SORTS } from '../shop.constants';
import type { ShopFulfillment, ShopSort } from '../shop.constants';

// Query-Parameter von GET /shop/products. Preise in Cent.
export class ListProductsQuery {
    @IsOptional() @IsString() @MaxLength(80)
    q?: string;

    @IsOptional() @IsString() @MaxLength(40)
    category?: string;

    @IsOptional() @IsIn(SHOP_FULFILLMENTS)
    fulfillment?: ShopFulfillment;

    @IsOptional() @Type(() => Number) @IsInt() @Min(0)
    minPrice?: number;

    @IsOptional() @Type(() => Number) @IsInt() @Min(0)
    maxPrice?: number;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
    minRating?: number;

    @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
    inStock?: boolean;

    @IsOptional() @IsIn(SHOP_SORTS)
    sort?: ShopSort;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
    page?: number;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(SHOP_PAGE_SIZE_MAX)
    limit?: number;
}
