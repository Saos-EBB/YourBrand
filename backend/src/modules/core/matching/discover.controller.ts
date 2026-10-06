import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { MatchingService } from './matching.service';
import { SwipeService } from './swipe.service';
import { SwipeDto } from './dto/swipe.dto';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';

@RequiresModule('matching')
@UseGuards(JwtGuard)
@Controller('discover')
export class DiscoverController {
    constructor(
        private readonly matchingService: MatchingService,
        private readonly swipeService: SwipeService,
    ) {}

    @Get('deck')
    async getDeck(@Req() req: any) {
        const userId: string = req.user.sub;
        return this.matchingService.buildDeck(userId);
    }

    @Get('matches')
    async getMatches(@Req() req: any) {
        const userId: string = req.user.sub;
        return this.matchingService.getMatches(userId);
    }

    @Post('swipe')
    async swipe(@Req() req: any, @Body() dto: SwipeDto) {
        const userId: string = req.user.sub;
        return this.swipeService.swipe(userId, dto);
    }

    @Delete('swipes')
    async resetSwipes(@Req() req: any) {
        const userId: string = req.user.sub;
        await this.swipeService.resetSwipes(userId);
        return { ok: true };
    }
}
