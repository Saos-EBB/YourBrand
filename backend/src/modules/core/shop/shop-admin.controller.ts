import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { ShopAdminService } from './shop-admin.service';
import { ShopOrdersAdminService } from './shop-orders-admin.service';
import { AdminListOrdersQuery, ApproveOrderDto, BlockBuyerDto, RefundOrderDto, RejectOrderDto, SetProgressDto } from './dto/admin-order.dto';
import { ShopRefundService } from './shop-refund.service';
import { ShopFulfillmentService } from './shop-fulfillment.service';
import { ShopCasesService } from './shop-cases.service';
import { AdminCaseMessageDto, AdminListCasesQuery, ReportBuyerDto, ResolveCaseDto } from './dto/case.dto';
import { AddCodesDto, AdminListProductsQuery, CreateProductDto, ImportProductsDto, UpdateProductDto } from './dto/admin-product.dto';

// Artikelpflege und Bestellungen — nur Admins (Owner erbt). Loeschen gibt es nicht: Artikel
// haengen an Bestellungen, ausblenden geht ueber active = false.
@RequiresModule('shop')
@UseGuards(JwtGuard, RolesGuard)
@Roles('admin')
@Controller('admin/shop')
export class ShopAdminController {
    constructor(
        private readonly admin: ShopAdminService,
        private readonly orders: ShopOrdersAdminService,
        private readonly fulfillment: ShopFulfillmentService,
        private readonly cases: ShopCasesService,
        private readonly refunds: ShopRefundService,
    ) { }

    @Get('products')
    list(@Query() query: AdminListProductsQuery) {
        return this.admin.listProducts(query);
    }

    @Post('products')
    create(@Body() dto: CreateProductDto) {
        return this.admin.createProduct(dto);
    }

    // vor products/:id, sonst greift die Parameter-Route
    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post('products/import')
    import(@Body() dto: ImportProductsDto) {
        return this.admin.importCsv(dto.csv, dto.dryRun ?? false);
    }

    @Patch('products/:id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
        return this.admin.updateProduct(id, dto);
    }

    @Post('products/:id/codes')
    addCodes(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCodesDto) {
        return this.admin.addCodes(id, dto.codes);
    }

    @Get('orders')
    listOrders(@Query() query: AdminListOrdersQuery) {
        return this.orders.listOrders(query);
    }

    @Get('orders/:id')
    getOrder(@Param('id', ParseUUIDPipe) id: string) {
        return this.orders.getOrder(id);
    }

    @Post('orders/:id/approve')
    approve(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveOrderDto) {
        return this.orders.approve(req.user.sub, id, dto.note);
    }

    @Post('orders/:id/reject')
    reject(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectOrderDto) {
        return this.orders.reject(req.user.sub, id, dto.note);
    }

    @Post('orders/:id/progress')
    progress(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetProgressDto) {
        return this.fulfillment.setProgress(req.user.sub, id, dto.progress, dto.trackingNumber);
    }

    @Post('orders/:id/refund')
    refund(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundOrderDto) {
        return this.refunds.refund(req.user.sub, id, dto.amountCents, dto.note, dto.revokeCodes);
    }

    @Put('blocks/:userId')
    block(@Req() req: any, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: BlockBuyerDto) {
        return this.refunds.block(req.user.sub, userId, dto.reason, dto.days);
    }

    @Delete('blocks/:userId')
    unblock(@Param('userId', ParseUUIDPipe) userId: string) {
        return this.refunds.unblock(userId);
    }

    @Post('orders/:id/report')
    reportBuyer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportBuyerDto) {
        return this.cases.reportBuyer(req.user.sub, id, dto);
    }

    @Get('cases')
    listCases(@Query() query: AdminListCasesQuery) {
        return this.cases.listCases(query);
    }

    @Get('cases/:id')
    getCase(@Param('id', ParseUUIDPipe) id: string) {
        return this.cases.getCase(id);
    }

    @Post('cases/:id/messages')
    replyCase(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminCaseMessageDto) {
        return this.cases.adminReply(req.user.sub, id, dto.body, dto.internal ?? false);
    }

    @Post('cases/:id/resolve')
    resolveCase(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveCaseDto) {
        return this.cases.resolve(req.user.sub, id, dto.resolution);
    }
}
