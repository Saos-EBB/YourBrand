import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ConversationsService } from './conversations.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactRequest } from './entities/contact-request.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { User } from '../auth/entities/user.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Block } from '../profile/entities/block.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([ContactRequest, Conversation, Message, User, Profile, Block]),
        ModerationModule,
        NotificationsModule,
    ],
    controllers: [ChatController],
    providers: [ChatService, JwtGuard, ChatGateway, ConversationsService],
    exports: [ChatGateway, ConversationsService],
})
export class ChatModule { }
