import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { BadgeService } from './badge.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';

@RequiresModule('hidden')
@Controller('hidden/badge')
@UseGuards(JwtGuard)
export class BadgeController {
    constructor(private readonly badgeService: BadgeService) {}

    @Get('mine')
    getMine(@Request() req: any) {
        return this.badgeService.getActiveBadges(req.user.sub);
    }
}
