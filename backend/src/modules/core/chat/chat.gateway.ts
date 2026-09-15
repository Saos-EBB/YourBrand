
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from '../../shared/events/app-events';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull, Not } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageType } from './entities/message.entity';
import { Profile } from '../profile/entities/profile.entity';
import { ProfanityService } from '../moderation/profanity.service';
import { getCorsOrigins } from '../../../common/config/cors-origins.helper';

@WebSocketGateway({
    cors: {
        origin: getCorsOrigins('http://localhost:3001'),
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
    },
})
export class ChatGateway implements OnGatewayConnection {
    @WebSocketServer()
    server!: Server;

    constructor(
        private readonly jwtService: JwtService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(Conversation)
        private readonly conversationRepo: Repository<Conversation>,
        @InjectRepository(Message)
        private readonly messageRepo: Repository<Message>,
        @InjectRepository(Profile)
        private readonly profileRepo: Repository<Profile>,
        private readonly profanityService: ProfanityService,
    ) {}

    private extractUserId(client: Socket): string | null {
        try {
            const token = (client.handshake.auth?.token ?? client.handshake.query?.token) as string;
const payload = this.jwtService.verify<{ sub: string }>(token);
            return payload.sub;
        } catch {
            return null;
        }
    }

    async handleConnection(client: Socket) {
        const userId = this.extractUserId(client);
        if (!userId) {
            client.disconnect();
            return;
        }

        const [{ exists }] = await this.dataSource.query(
            'SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL) AS exists',
            [userId],
        );
        if (!exists) {
            client.disconnect();
            return;
        }

        // Admin clients join a shared room so ticket.new can be broadcast to all of them
        try {
            const token = (client.handshake.auth?.token ?? client.handshake.query?.token) as string;
            const { role } = this.jwtService.verify<{ sub: string; role?: string }>(token);
            if (role === 'admin' || role === 'owner') client.join('admin');
        } catch { /* non-critical — client stays connected as regular user */ }

        const conversations = await this.conversationRepo.find({
            where: [
                { user_a_id: userId, deleted_at_a: IsNull() },
                { user_b_id: userId, deleted_at_b: IsNull() },
            ],
            select: ['id'],
        });

for (const conv of conversations) {
            client.join(conv.id);
        }

        client.join(`user:${userId}`);
    }

    emitToUser(userId: string, event: string, data: unknown): void {
        this.server.to(`user:${userId}`).emit(event, data);
    }

    @OnEvent('notification.created')
    handleNotificationCreated(payload: { userId: string; notification: any }) {
        this.emitToUser(payload.userId, 'notification', payload.notification);
    }

    @OnEvent(AppEvents.contactRequest)
    handleContactRequestCreated(payload: { requestId: string; senderId: string; receiverId: string }) {
        this.emitToUser(payload.receiverId, 'contact_request', {
            requestId: payload.requestId,
            senderId: payload.senderId,
        });
    }

    @OnEvent('contact_request.accepted')
    handleContactRequestAccepted(payload: { senderId: string; conversationId: string; acceptedByNickname: string }) {
        this.emitToUser(payload.senderId, 'contact_request_accepted', {
            conversationId: payload.conversationId,
            acceptedByNickname: payload.acceptedByNickname,
        });
    }

    @OnEvent('user.banned')
    handleUserBanned(payload: { userId: string }) {
        this.emitToUser(payload.userId, 'user.banned', {});
    }

    @OnEvent('user.unbanned')
    handleUserUnbanned(payload: { userId: string }) {
        this.emitToUser(payload.userId, 'user.unbanned', {});
    }

    @OnEvent('ticket.new')
    handleTicketNew(): void {
        this.server.to('admin').emit('ticket.new', {});
    }

    @OnEvent('media.pending_review')
    handleMediaPendingReview(payload: { mediaId: string; fileType: string; uploadedAt: Date; uploadedBy: string }): void {
        this.server.to('admin').emit('media:pending_review', {
            mediaId: payload.mediaId,
            fileType: payload.fileType,
            uploadedAt: payload.uploadedAt,
            uploadedBy: payload.uploadedBy,
        });
    }

    @SubscribeMessage('join_conversation')
    async handleJoinConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() conversationId: string,
    ) {
        conversationId = conversationId.replace(/^"|"$/g, '').trim();
        const userId = this.extractUserId(client);
        if (!userId) return;

        const conversation = await this.conversationRepo.findOne({
            where: [
                { id: conversationId, user_a_id: userId, deleted_at_a: IsNull() },
                { id: conversationId, user_b_id: userId, deleted_at_b: IsNull() },
            ],
        });

        if (!conversation) return;
        client.join(conversationId);
    }

    @SubscribeMessage('send_message')
    async handleSendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: string; content?: string; type?: MessageType },
    ) {
        const userId = this.extractUserId(client);
        if (!userId) return;

        const conversation = await this.conversationRepo.findOne({
            where: [
                { id: data.conversationId, user_a_id: userId, deleted_at_a: IsNull() },
                { id: data.conversationId, user_b_id: userId, deleted_at_b: IsNull() },
            ],
        });

        if (!conversation) return;

        const message = await this.messageRepo.save(
            this.messageRepo.create({
                conversation_id: data.conversationId,
                sender_id: userId,
                content: data.content ?? null,
                type: data.type ?? MessageType.TEXT,
            }),
        );

        if (data.content && this.profanityService.check(data.content)) {
            this.profanityService.flagUser(userId, '', 'chat').catch(() => {});
        }

        const senderProfile = await this.profileRepo.findOne({
            where: { user_id: userId },
            select: { id: true, nickname: true },
        });

        this.server.to(data.conversationId).emit('new_message', {
            ...message,
            sender_nickname: senderProfile?.nickname ?? 'Unbekannt',
        });
    }

    @SubscribeMessage('typing')
    async handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() conversationId: string,
    ) {
        const userId = this.extractUserId(client);
        if (!userId) return;

        const conversation = await this.conversationRepo.findOne({
            where: [
                { id: conversationId, user_a_id: userId, deleted_at_a: IsNull() },
                { id: conversationId, user_b_id: userId, deleted_at_b: IsNull() },
            ],
        });

        if (!conversation) return;

        client.to(conversationId).emit('user_typing', { userId, conversationId });
    }

    @SubscribeMessage('read_messages')
    async handleReadMessages(
        @ConnectedSocket() client: Socket,
        @MessageBody() conversationId: string,
    ) {
        conversationId = conversationId.replace(/^"|"$/g, '').trim();
        const userId = this.extractUserId(client);
        if (!userId) return;

        const conversation = await this.conversationRepo.findOne({
            where: [
                { id: conversationId, user_a_id: userId, deleted_at_a: IsNull() },
                { id: conversationId, user_b_id: userId, deleted_at_b: IsNull() },
            ],
        });

        if (!conversation) return;

        await this.messageRepo.update(
            { conversation_id: conversationId, sender_id: Not(userId), read_at: IsNull() },
            { read_at: new Date() },
        );

        this.server.to(conversationId).emit('messages_read', { userId, conversationId });
    }
}
