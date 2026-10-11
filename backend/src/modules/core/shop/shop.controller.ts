import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
import { ShopCasesService } from './shop-cases.service';
import { CaseMessageDto, OpenProblemDto } from './dto/case.dto';
import { ShopInvoiceService } from './shop-invoice.service';
import { pdfFile } from './shop-admin.controller';

@RequiresModule('shop')
@UseGuards(JwtGuard)
@Controller('shop')
export class ShopController {
    constructor(
        private readonly shop: ShopService,
        private readonly checkoutService: ShopCheckoutService,
        private readonly orders: ShopOrdersService,
        private readonly redeemService: ShopRedeemService,
        private readonly cases: ShopCasesService,
        private readonly invoices: ShopInvoiceService,
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

    @Get('orders/:id/invoices')
    myInvoices(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.invoices.listMine(req.user.sub, id);
    }

    @Get('invoices/:id/pdf')
    async myInvoicePdf(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
        const { number, pdf } = await this.invoices.pdf(id, req.user.sub);
        return pdfFile(res, number, pdf);
    }

    // Raten bremsen: 60 Bit pro Code, trotzdem wenige Versuche pro Stunde
    @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
    @Post('redeem')
    redeem(@Req() req: any, @Body() dto: RedeemCodeDto) {
        return this.redeemService.redeem(req.user.sub, dto.code);
    }

    @Get('orders/:id/cases')
    myCases(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.cases.buyerCases(req.user.sub, id);
    }

    @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
    @Post('orders/:id/cases')
    openProblem(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OpenProblemDto) {
        return this.cases.openProblem(req.user.sub, id, dto);
    }

    @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
    @Post('cases/:id/messages')
    replyCase(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CaseMessageDto) {
        return this.cases.buyerReply(req.user.sub, id, dto.body);
    }
}
