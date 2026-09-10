import { Controller, Get, Post, Patch, Body, Param, Request, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ProfanityService } from './profanity.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateStrikeDto } from './dto/create-strike.dto';
import { RejectMediaDto } from './dto/reject-media.dto';

@Controller('moderation')
export class ModerationController {
    constructor(
        private readonly moderationService: ModerationService,
        private readonly profanityService: ProfanityService,
    ) { }

    @Get('wordlist')
    getWordlist(): { words: string[] } {
        return { words: this.profanityService.getFullWordList() };
    }

    @Post('reports')
    @UseGuards(JwtGuard)
    createReport(@Request() req: any, @Body() dto: CreateReportDto) {
        return this.moderationService.createReport(req.user.sub, dto);
    }

    @Get('reports')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    getReports() {
        return this.moderationService.getReports();
    }

    @Get('reports/:id')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    getReport(@Param('id', ParseUUIDPipe) id: string) {
        return this.moderationService.getReport(id);
    }

    @Post('strikes')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    createStrike(@Request() req: any, @Body() dto: CreateStrikeDto) {
        return this.moderationService.createStrike(req.user.sub, dto);
    }

    @Get('strikes')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    getStrikes() {
        return this.moderationService.getStrikes();
    }

    @Patch('reports/:id/review')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    reviewReport(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateReviewDto,
    ) {
        return this.moderationService.reviewReport(req.user.sub, id, dto);
    }

    @Get('admin/media/queue')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    getMediaQueue() {
        return this.moderationService.getMediaQueue();
    }

    @Patch('admin/media/:id/approve')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    approveMedia(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.moderationService.approveMedia(req.user.sub, id);
    }

    @Patch('admin/media/:id/reject')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles('admin')
    rejectMedia(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RejectMediaDto,
    ) {
        return this.moderationService.rejectMedia(req.user.sub, id, dto.reason);
    }
}
