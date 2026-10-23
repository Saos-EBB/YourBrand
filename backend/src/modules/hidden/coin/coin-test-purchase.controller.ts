import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import { CoinService } from './coin.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { LoadtestKeyGuard } from '../../../common/loadtest/loadtest-key.guard';

// Nur gemountet wenn LOADTEST_MODE=true (siehe CoinModule) — ausserhalb davon
// existiert diese Route nicht (404), nicht nur ein if-Check hier drin.
// Zusaetzlich nur mit passendem Loadtest-Schluessel (X-Loadtest-Key), sonst ebenfalls 404.
@RequiresModule('hidden')
@Controller('hidden/coin')
@UseGuards(LoadtestKeyGuard, JwtGuard)
export class CoinTestPurchaseController {
    constructor(private readonly coinService: CoinService) { }

    @Post('test-purchase')
    testPurchase(@Request() req: any, @Body('package') pkg?: string) {
        return this.coinService.testPurchase(req.user.sub, pkg as any);
    }
}
