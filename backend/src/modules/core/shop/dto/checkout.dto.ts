import { Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayMinSize, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max,
    MaxLength, Min, ValidateNested,
} from 'class-validator';
import { SHOP_DELIVERY_MODES } from '../shop.constants';
import type { ShopDeliveryMode } from '../shop.constants';

class CheckoutItemDto {
    @IsUUID()
    productId!: string;

    @IsInt() @Min(1) @Max(99)
    quantity!: number;
}

// Pflichtfelder je Lieferart prueft ShopService (wie chk_shop_contact in 007)
export class CheckoutDto {
    @ValidateNested({ each: true }) @Type(() => CheckoutItemDto) @ArrayMinSize(1) @ArrayMaxSize(50)
    items!: CheckoutItemDto[];

    @IsIn(SHOP_DELIVERY_MODES)
    deliveryMode!: ShopDeliveryMode;

    @IsOptional() @IsString() @Length(2, 200)
    contactName?: string;

    @IsOptional() @IsString() @Length(5, 40)
    contactPhone?: string;

    @IsOptional() @IsString() @Length(5, 500)
    deliveryAddress?: string;

    @IsOptional() @IsDateString()
    desiredAt?: string;

    @IsOptional() @IsString() @MaxLength(300)
    deliveryNote?: string;

    // Digitale Inhalte: Zustimmung zur sofortigen Ausfuehrung und Kenntnis vom
    // Erloeschen des Widerrufsrechts (§ 356 Abs. 5 BGB)
    @IsOptional() @IsBoolean()
    withdrawalWaiver?: boolean;
}
