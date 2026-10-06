import {
    Controller,
    Delete,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Request,
    UseGuards,
    ParseUUIDPipe,
    NotFoundException,
} from '@nestjs/common';
import { GameType } from './entities/beef.entity';
import { BeefService } from './beef.service';
import { BeefGameService } from './beef-game.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { CreateBeefDto } from './dto/create-beef.dto';
import { RespondBeefDto } from './dto/respond-beef.dto';
import { VoteBeefDto } from './dto/vote-beef.dto';
import { CommentBeefDto } from './dto/comment-beef.dto';
import { GameMoveDto } from './dto/game-move.dto';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';

@RequiresModule('hidden')
@Controller('hidden/beef')
@UseGuards(JwtGuard)
export class BeefController {
    constructor(
        private readonly beefService: BeefService,
        private readonly beefGameService: BeefGameService,
    ) { }

    @Post()
    create(@Request() req: any, @Body() dto: CreateBeefDto) {
        return this.beefService.create(req.user.sub, dto);
    }

    @Post(':id/respond')
    respond(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RespondBeefDto,
    ) {
        return this.beefService.respond(id, req.user.sub, dto);
    }

    @Delete(':id/reject')
    reject(@Param('id', ParseUUIDPipe) id: string) {
        return this.beefService.reject(id);
    }

    @Get('pending')
    getPending() {
        return this.beefService.getPending();
    }

    @Get('incoming')
    getIncoming(@Request() req: any) {
        return this.beefService.getIncoming(req.user.sub);
    }

    @Get('my-active')
    getMyActive(@Request() req: any) {
        return this.beefService.getMyActive(req.user.sub);
    }

    @Get('exile/status')
    getExileStatus(@Request() req: any) {
        return this.beefService.getExileStatus(req.user.sub);
    }

    @Post('exile/leave')
    leaveExile(@Request() req: any) {
        return this.beefService.leaveExile(req.user.sub);
    }

    @Get('public')
    listPublic(@Request() req: any) {
        return this.beefService.listPublic(req.user.sub);
    }

    @Get('highscore')
    getHighscore() {
        return this.beefService.getHighscore();
    }

    @Post('dev/quick-fight')
    devQuickFight(@Request() req: any, @Body() body: { targetUserId: string; gameType?: string }) {
        if (process.env.NODE_ENV === 'production') throw new NotFoundException();
        return this.beefService.devQuickFight(
            req.user.sub,
            body.targetUserId,
            (body.gameType as GameType) ?? GameType.TICTACTOE,
        );
    }

    @Get(':id')
    getById(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
        return this.beefService.getById(id, req.user.sub);
    }

    @Post(':id/game/ready')
    pressReady(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
        return this.beefGameService.pressReady(id, req.user.sub);
    }

    @Post(':id/game/move')
    applyMove(
        @Param('id', ParseUUIDPipe) id: string,
        @Request() req: any,
        @Body() dto: GameMoveDto,
    ) {
        return this.beefGameService.applyMove(id, req.user.sub, dto.move);
    }

    @Get(':id/game')
    getGame(@Param('id', ParseUUIDPipe) id: string) {
        return this.beefGameService.getGame(id);
    }

    @Get()
    listActive() {
        return this.beefService.listActive();
    }

    @Post(':id/vote')
    vote(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: VoteBeefDto,
    ) {
        return this.beefService.vote(id, req.user.sub, dto);
    }

    @Post(':id/comment')
    addComment(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CommentBeefDto,
    ) {
        return this.beefService.addComment(id, req.user.sub, dto);
    }

    @Get(':id/comments')
    getComments(@Param('id', ParseUUIDPipe) id: string) {
        return this.beefService.getComments(id);
    }

    @Get(':id/votes')
    getVotes(@Param('id', ParseUUIDPipe) id: string) {
        return this.beefService.getVotes(id);
    }

    @Patch(':id/approve')
    approve(@Param('id', ParseUUIDPipe) id: string) {
        return this.beefService.approve(id);
    }
}
