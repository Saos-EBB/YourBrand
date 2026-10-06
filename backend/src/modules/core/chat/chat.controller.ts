import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Request,
    UseGuards,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { SendContactRequestDto } from './dto/send-contact-request.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';

@RequiresModule('chat')
@Controller('chat')
@UseGuards(JwtGuard)
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post('requests')
    sendContactRequest(@Request() req: any, @Body() dto: SendContactRequestDto) {
        return this.chatService.sendContactRequest(req.user.sub, dto);
    }
was
    @Get('requests/incoming')
    getIncomingRequests(@Request() req: any) {
        return this.chatService.getIncomingRequests(req.user.sub);
    }

    @Get('requests/outgoing')
    getOutgoingRequests(@Request() req: any) {
        return this.chatService.getOutgoingRequests(req.user.sub);
    }

    @Patch('requests/:id/accept')
    acceptRequest(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.chatService.acceptRequest(req.user.sub, id);
    }

    @Patch('requests/:id/decline')
    declineRequest(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.chatService.declineRequest(req.user.sub, id);
    }

    @Get('conversations')
    getConversations(@Request() req: any) {
        return this.chatService.getConversations(req.user.sub);
    }

    @Get('conversations/partners')
    getConversationPartners(@Request() req: any) {
        return this.chatService.getConversationPartners(req.user.sub);
    }

    @Get('conversations/:id')
    getConversation(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.chatService.getConversation(req.user.sub, id);
    }

    @Get('conversations/:id/messages')
    getMessages(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.chatService.getMessages(req.user.sub, id);
    }

    @Post('conversations/:id/messages')
    sendMessage(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: SendMessageDto,
    ) {
        return this.chatService.sendMessage(req.user.sub, id, dto);
    }

    @Delete('conversations/:id')
    deleteConversation(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.chatService.deleteConversation(req.user.sub, id);
    }

    @Delete('connections/:userId')
    disconnectUser(@Request() req: any, @Param('userId', ParseUUIDPipe) userId: string) {
        return this.chatService.disconnectUser(req.user.sub, userId);
    }

    @Delete('messages/:id')
    deleteMessage(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.chatService.deleteMessage(req.user.sub, id);
    }
}
