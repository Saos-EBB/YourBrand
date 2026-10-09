import {
    Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { BoardService } from './board.service';
import { CreateBoardPostDto } from './dto/create-board-post.dto';
import { BOARD_KINDS, BOARD_RANGES } from './board.constants';
import type { BoardKind, BoardRange } from './board.constants';

class TearDto {
    @IsOptional() @IsString() @MaxLength(300)
    message?: string;
}

@RequiresModule('board')
@Controller('board')
export class BoardController {
    constructor(private readonly board: BoardService) { }

    // Oeffentlich (kein Guard): Vorschau fuer die Landingpage, nur
    // Aushaenge mit Sichtbarkeit "public" (AGB § 7)
    @SkipThrottle()
    @Get('public')
    listPublic(@Query('limit') limit?: string) {
        return this.board.listPublic(limit ? parseInt(limit, 10) || 6 : 6);
    }

    @UseGuards(JwtGuard)
    @Get()
    list(@Req() req: any, @Query('range') range?: string, @Query('kind') kind?: string) {
        const r: BoardRange = (BOARD_RANGES as readonly string[]).includes(range ?? '') ? (range as BoardRange) : 'all';
        const k = (BOARD_KINDS as readonly string[]).includes(kind ?? '') ? (kind as BoardKind) : undefined;
        return this.board.list(req.user.sub, r, k);
    }

    @UseGuards(JwtGuard)
    @Get('consent')
    async consent(@Req() req: any) {
        return { public: await this.board.hasPublicConsent(req.user.sub) };
    }

    @UseGuards(JwtGuard)
    @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
    @Post()
    create(@Req() req: any, @Body() dto: CreateBoardPostDto) {
        return this.board.create(req.user.sub, dto);
    }

    @UseGuards(JwtGuard)
    @Get(':id')
    get(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.board.get(req.user.sub, id);
    }

    @UseGuards(JwtGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(':id')
    remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.board.remove(req.user.sub, req.user.role, id);
    }

    @UseGuards(JwtGuard)
    @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
    @Post(':id/tear')
    tear(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TearDto) {
        return this.board.tear(req.user.sub, id, dto.message);
    }
}
