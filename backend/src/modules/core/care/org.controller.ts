import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { OrgService } from './org.service';
import { AddMemberDto, CreateOrgDto } from './care.dto';

@RequiresModule('orgs')
@UseGuards(JwtGuard)
@Controller('orgs')
export class OrgController {
    constructor(private readonly orgs: OrgService) { }

    @Get('mine')
    mine(@Req() req: any) {
        return this.orgs.mine(req.user.sub);
    }

    @Post()
    create(@Req() req: any, @Body() dto: CreateOrgDto) {
        return this.orgs.create(req.user.sub, req.user.role, dto);
    }

    @Get(':id')
    overview(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.orgs.overview(req.user.sub, id);
    }

    @Post(':id/members')
    addMember(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
        return this.orgs.addMember(req.user.sub, id, dto);
    }

    @Delete(':id/members/:userId')
    removeMember(
        @Req() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Param('userId', ParseUUIDPipe) userId: string,
    ) {
        return this.orgs.removeMember(req.user.sub, id, userId);
    }
}
