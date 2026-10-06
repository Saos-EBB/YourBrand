import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { CoinService } from './coin.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';

@RequiresModule('hidden')
@Controller('hidden/coin')
@UseGuards(JwtGuard)
export class CoinController {
    constructor(private readonly coinService: CoinService) { }

    @Get('balance')
    getBalance(@Request() req: any) {
        return this.coinService.getBalance(req.user.sub);
    }

    @Post('purchase')
    purchase(@Request() req: any, @Body('package') pkg: string) {
        return this.coinService.createCoinCheckout(req.user.sub, pkg as any);
    }

    @Post('confirm')
    confirm(@Request() req: any, @Body('session_id') sessionId: string) {
        return this.coinService.confirmCoinPurchase(sessionId, req.user.sub);
    }
}
