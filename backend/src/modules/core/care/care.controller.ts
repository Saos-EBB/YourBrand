import {
    Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';
import { CareService } from './care.service';
import { DecideDto, InviteClientDto, ProtectionDto, UpdateRightsDto } from './care.dto';

@RequiresModule('caretaker')
@UseGuards(JwtGuard)
@Controller('care')
export class CareController {
    constructor(private readonly care: CareService) { }

    // Betreute Person: wer hilft mir, mit welchen Rechten
    @Get('helpers')
    helpers(@Req() req: any) {
        return this.care.myHelpers(req.user.sub);
    }

    @Post('helpers/:id/accept')
    accept(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.care.acceptHelper(req.user.sub, id);
    }

    @Patch('helpers/:id')
    rights(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRightsDto) {
        return this.care.updateRights(req.user.sub, id, dto);
    }

    @Delete('helpers/:id')
    revoke(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.care.revokeHelper(req.user.sub, id);
    }

    // Betreuung: meine Leute, Freigaben
    @Get('clients')
    clients(@Req() req: any) {
        return this.care.myClients(req.user.sub);
    }

    @Post('clients')
    invite(@Req() req: any, @Body() dto: InviteClientDto) {
        return this.care.invite(req.user.sub, dto);
    }

    @Get('approvals')
    approvals(@Req() req: any) {
        return this.care.approvals(req.user.sub);
    }

    @Patch('approvals/:id')
    decide(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
        return this.care.decide(req.user.sub, id, dto.approve);
    }

    @Patch('clients/:userId/protection')
    protection(@Req() req: any, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: ProtectionDto) {
        return this.care.setProtection(req.user.sub, userId, dto.enhanced_protection);
    }

    @Get('clients/:userId/conversations')
    conversations(@Req() req: any, @Param('userId', ParseUUIDPipe) userId: string) {
        return this.care.clientConversations(req.user.sub, userId);
    }

    @Get('clients/:userId/conversations/:conversationId/messages')
    messages(
        @Req() req: any,
        @Param('userId', ParseUUIDPipe) userId: string,
        @Param('conversationId', ParseUUIDPipe) conversationId: string,
    ) {
        return this.care.clientMessages(req.user.sub, userId, conversationId);
    }
}
