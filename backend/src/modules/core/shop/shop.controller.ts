import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { ShopService } from './shop.service';
import { ShopCheckoutService } from './shop-checkout.service';
import { ListProductsQuery } from './dto/list-products.query';
import { CreateReviewDto } from './dto/create-review.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { MyOrdersQuery } from './dto/my-orders.query';
import { ShopOrdersService } from './shop-orders.service';
import { ShopRedeemService } from './shop-redeem.service';
import { RedeemCodeDto } from './dto/redeem.dto';

@RequiresModule('shop')
@UseGuards(JwtGuard)
@Controller('shop')
export class ShopController {
    constructor(
        private readonly shop: ShopService,
        private readonly checkoutService: ShopCheckoutService,
        private readonly orders: ShopOrdersService,
        private readonly redeemService: ShopRedeemService,
    ) { }

    // Was der Kaeufer vor der Bestellung sehen muss (Versandkosten, PAngV)
    @Get('settings')
    settings() {
        return this.shop.getSettings();
    }

    @Get('products')
    list(@Query() query: ListProductsQuery) {
        return this.shop.listProducts(query);
    }

    @Get('products/:id')
    get(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.shop.getProduct(req.user.sub, id);
    }

    @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
    @HttpCode(HttpStatus.NO_CONTENT)
    @Post('products/:id/reviews')
    review(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateReviewDto) {
        return this.shop.upsertReview(req.user.sub, id, dto);
    }

    @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
    @Post('checkout')
    checkout(@Req() req: any, @Body() dto: CheckoutDto) {
        return this.checkoutService.checkout(req.user.sub, dto);
    }

    @Get('orders')
    myOrders(@Req() req: any, @Query() query: MyOrdersQuery) {
        return this.orders.listMine(req.user.sub, query.page);
    }

    @Get('orders/:id')
    myOrder(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.orders.getMine(req.user.sub, id);
    }

    // Raten bremsen: 60 Bit pro Code, trotzdem wenige Versuche pro Stunde
    @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
    @Post('redeem')
    redeem(@Req() req: any, @Body() dto: RedeemCodeDto) {
        return this.redeemService.redeem(req.user.sub, dto.code);
    }
}
