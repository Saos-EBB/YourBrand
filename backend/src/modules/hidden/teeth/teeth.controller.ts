import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { TeethService } from './teeth.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';

@RequiresModule('hidden')
@Controller('hidden/teeth')
@UseGuards(JwtGuard)
export class TeethController {
    constructor(private readonly teethService: TeethService) { }

    @Get()
    getTeeth(@Request() req: any) {
        return this.teethService.getTeeth(req.user.sub);
    }

    @Get('chains')
    getChains(@Request() req: any) {
        return this.teethService.getChains(req.user.sub);
    }

    @Post('transform')
    transform(@Request() req: any) {
        return this.teethService.transform(req.user.sub);
    }
}
