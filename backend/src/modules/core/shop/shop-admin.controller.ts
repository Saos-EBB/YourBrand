import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { ShopAdminService } from './shop-admin.service';
import { ShopOrdersAdminService } from './shop-orders-admin.service';
import { AdminListOrdersQuery, ApproveOrderDto, RejectOrderDto } from './dto/admin-order.dto';
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
}
