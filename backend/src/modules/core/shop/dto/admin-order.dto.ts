import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { SHOP_PROGRESS, type ShopProgress } from '../shop-fulfillment';

export const SHOP_ORDER_STATUSES = [
    'pending', 'authorized', 'held', 'approved', 'fulfilled',
    'rejected', 'expired', 'cancelled', 'refunded', 'partially_refunded',
] as const;
export type ShopOrderStatus = (typeof SHOP_ORDER_STATUSES)[number];

export class AdminListOrdersQuery {
    // Bestellnummer (Anfang der ID), Mail, Name oder Nickname
    @IsOptional() @IsString() @MaxLength(80)
    q?: string;

    @IsOptional() @IsIn([...SHOP_ORDER_STATUSES, 'all'])
    status?: ShopOrderStatus | 'all';

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
    page?: number;
}

export class ApproveOrderDto {
    @IsOptional() @IsString() @MaxLength(1000)
    note?: string;
}

// Ablehnen nur mit Begruendung (CHECK chk_shop_reject_reason)
export class RejectOrderDto {
    @IsString() @Length(5, 1000, { message: 'Begründung: 5–1000 Zeichen' })
    note!: string;
}

export class SetProgressDto {
    @IsIn(SHOP_PROGRESS)
    progress!: ShopProgress;

    // Nur bei "versendet"
    @IsOptional() @IsString() @MaxLength(80)
    trackingNumber?: string;
}
