import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { ShopService } from './shop.service';
import { ListProductsQuery } from './dto/list-products.query';
import { CreateReviewDto } from './dto/create-review.dto';

@RequiresModule('shop')
@UseGuards(JwtGuard)
@Controller('shop')
export class ShopController {
    constructor(private readonly shop: ShopService) { }

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
}
