import {
    Injectable,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { ContactRequest, ContactRequestStatus } from './entities/contact-request.entity';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageType } from './entities/message.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Block } from '../profile/entities/block.entity';
import { SendContactRequestDto } from './dto/send-contact-request.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ProfanityService } from '../moderation/profanity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TypedEventBus, AppEvents } from '../../shared/events/app-events';
import { ConversationsService } from './conversations.service';

@Injectable()
export class ChatService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(ContactRequest)
        private readonly contactRequestRepository: Repository<ContactRequest>,
        @InjectRepository(Conversation)
        private readonly conversationRepository: Repository<Conversation>,
        private readonly conversationsService: ConversationsService,
        @InjectRepository(Message)
        private readonly messageRepository: Repository<Message>,
        @InjectRepository(Profile)
        private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Block)
        private readonly blockRepository: Repository<Block>,
        private readonly profanityService: ProfanityService,
        private readonly notificationsService: NotificationsService,
        private readonly eventEmitter: EventEmitter2,
        private readonly typedEventBus: TypedEventBus,
    ) { }

    async sendContactRequest(senderId: string, dto: SendContactRequestDto) {
        if (senderId === dto.receiver_id) {
            throw new BadRequestException('Anfrage an sich selbst nicht erlaubt');
        }

        const [sender, receiver] = await Promise.all([
            this.userRepository.findOne({ where: { id: senderId } }),
            this.userRepository.findOne({ where: { id: dto.receiver_id, deleted_at: IsNull() } }),
        ]);
        if (!receiver) throw new NotFoundException('Benutzer nicht gefunden');
        if (sender?.role === 'admin' || receiver.role === 'admin') {
            throw new ForbiddenException('Verbindungsanfragen mit Admin-Accounts sind nicht möglich');
        }

        const existing = await this.contactRequestRepository.findOne({
            where: { sender_id: senderId, receiver_id: dto.receiver_id, status: ContactRequestStatus.PENDING },
        });
        if (existing) throw new ConflictException('Anfrage bereits gesendet');

        const request = this.contactRequestRepository.create({
            sender_id: senderId,
            receiver_id: dto.receiver_id,
            message_preview: dto.message_preview ?? null,
        });

        const saved = await this.contactRequestRepository.save(request);
        this.typedEventBus.emit(AppEvents.contactRequest, {
            requestId: saved.id,
            senderId: senderId,
            receiverId: dto.receiver_id,
        });

        return saved;
    }

    async getIncomingRequests(userId: string) {
        return this.contactRequestRepository.find({
            where: { receiver_id: userId, status: ContactRequestStatus.PENDING },
            order: { created_at: 'DESC' },
        });
    }

    async getOutgoingRequests(userId: string) {
        return this.contactRequestRepository.find({
            where: { sender_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    async acceptRequest(userId: string, requestId: string) {
        const request = await this.contactRequestRepository.findOne({
            where: { id: requestId },
        });

        if (!request) throw new NotFoundException('Anfrage nicht gefunden');
        if (request.receiver_id !== userId) throw new ForbiddenException('Keine Berechtigung');
        if (request.status !== ContactRequestStatus.PENDING) {
            throw new ConflictException('Anfrage ist nicht mehr ausstehend');
        }

        request.status = ContactRequestStatus.ACCEPTED;
        await this.contactRequestRepository.save(request);

        const savedConversation = await this.conversationsService.getOrCreate(
            request.sender_id,
            request.receiver_id,
            { contactRequestId: request.id },
        );

        const acceptorProfile = await this.profileRepository.findOne({
            where: { user_id: userId },
            select: { id: true, nickname: true },
        });

        this.eventEmitter.emit('contact_request.accepted', {
            senderId: request.sender_id,
            conversationId: savedConversation.id,
            acceptedByNickname: acceptorProfile?.nickname ?? 'Jemand',
        });

        this.notificationsService.createNotification(
            request.sender_id,
            'match',
            'notifications.request_accepted',
            'Kontaktanfrage angenommen',
            savedConversation.id,
            { nickname: acceptorProfile?.nickname ?? '' },
        ).catch(() => {});

        return savedConversation;
    }

    async declineRequest(userId: string, requestId: string) {
        const request = await this.contactRequestRepository.findOne({
            where: { id: requestId },
        });

        if (!request) throw new NotFoundException('Anfrage nicht gefunden');
        if (request.receiver_id !== userId) throw new ForbiddenException('Keine Berechtigung');
        if (request.status !== ContactRequestStatus.PENDING) {
            throw new ConflictException('Anfrage ist nicht mehr ausstehend');
        }

        await this.contactRequestRepository.update(requestId, { status: ContactRequestStatus.DECLINED });
        return { message: 'Anfrage abgelehnt' };
    }

    async getConversationPartners(userId: string): Promise<{ user_id: string; nickname: string; photo_url: string | null }[]> {
        return this.conversationRepository.manager.query<{ user_id: string; nickname: string; photo_url: string | null }[]>(`
            SELECT DISTINCT
                p.user_id,
                p.nickname,
                m.file_url AS photo_url
            FROM conversations c
            JOIN profiles p ON p.user_id = CASE
                WHEN c.user_a_id = $1 THEN c.user_b_id
                ELSE c.user_a_id
            END
            LEFT JOIN media_uploads m ON m.id = p.photo_id AND m.needs_review = false
            WHERE (c.user_a_id = $1 AND c.deleted_at_a IS NULL)
               OR (c.user_b_id = $1 AND c.deleted_at_b IS NULL)
            ORDER BY p.nickname
        `, [userId]);
    }

    async getConversations(userId: string) {
        const conversations = await this.conversationRepository.find({
            where: [
                { user_a_id: userId, deleted_at_a: IsNull() },
                { user_b_id: userId, deleted_at_b: IsNull() },
            ],
            order: { created_at: 'DESC' },
        });

        if (conversations.length === 0) return [];

        const ids = conversations.map(c => c.id);

        const partnerUserIds = [...new Set(conversations.map(c => c.user_a_id === userId ? c.user_b_id : c.user_a_id))];

        const [latestMessages, partnerProfiles] = await Promise.all([
            this.messageRepository
                .createQueryBuilder('msg')
                .where('msg.conversation_id IN (:...ids)', { ids })
                .andWhere(qb => {
                    const sub = qb
                        .subQuery()
                        .select('MAX(m2.sent_at)')
                        .from(Message, 'm2')
                        .where('m2.conversation_id = msg.conversation_id')
                        .getQuery();
                    return `msg.sent_at = (${sub})`;
                })
                .getMany(),
            this.profileRepository
                .createQueryBuilder('p')
                .select(['p.user_id', 'p.last_active_at', 'p.status_visible', 'p.status_message'])
                .where('p.user_id IN (:...partnerUserIds)', { partnerUserIds })
                .getMany(),
        ]);

        const latestByConversation = new Map(latestMessages.map(m => [m.conversation_id, m]));
        const profileByUserId = new Map(partnerProfiles.map(p => [p.user_id, p]));
        const onlineThreshold = new Date(Date.now() - 3 * 60 * 1000);

        return conversations.map(conv => {
            const latest = latestByConversation.get(conv.id);
            const partnerUserId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
            const partner = profileByUserId.get(partnerUserId);
            const is_online = !!partner?.status_visible && partner.last_active_at !== null && partner.last_active_at > onlineThreshold;

            return {
                ...conv,
                last_message_content: latest && !latest.is_deleted ? latest.content : null,
                last_message_sender_id: latest?.sender_id ?? null,
                last_message_at: latest?.sent_at ?? null,
                read_at: latest?.read_at ?? null,
                partner_last_active_at: partner?.last_active_at ?? null,
                partner_status_visible: partner?.status_visible ?? null,
                partner_status_message: partner?.status_message ?? null,
                partner_is_online: is_online,
            };
        }).sort((a, b) => {
            const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            return tb - ta;
        });
    }

    async deleteConversation(userId: string, conversationId: string) {
        const conversation = await this.verifyConversationAccess(userId, conversationId);
        const now = new Date();

        if (conversation.user_a_id === userId) {
            conversation.deleted_at_a = now;
        } else {
            conversation.deleted_at_b = now;
        }

        if (conversation.deleted_at_a && conversation.deleted_at_b) {
            conversation.purged_at = now;
        }

        await this.conversationRepository.save(conversation);
        return { message: 'Konversation gelöscht' };
    }

    async getConversation(userId: string, conversationId: string) {
        const conversation = await this.conversationRepository.findOne({
            where: [
                { id: conversationId, user_a_id: userId },
                { id: conversationId, user_b_id: userId },
            ],
        });

        if (!conversation) throw new NotFoundException('Konversation nicht gefunden');

        const partnerUserId = conversation.user_a_id === userId ? conversation.user_b_id : conversation.user_a_id;

        const [blockedByMe, blockedByThem] = await Promise.all([
            this.blockRepository.findOne({ where: { blocker_id: userId, blocked_id: partnerUserId } }),
            this.blockRepository.findOne({ where: { blocker_id: partnerUserId, blocked_id: userId } }),
        ]);

        const is_blocked = !!(blockedByMe || blockedByThem);
        const blocked_by: 'me' | 'them' | null = blockedByMe ? 'me' : blockedByThem ? 'them' : null;

        return { ...conversation, is_blocked, blocked_by };
    }

    async getMessages(userId: string, conversationId: string) {
        await this.verifyConversationAccess(userId, conversationId);

        const messages = await this.messageRepository.find({
            where: { conversation_id: conversationId },
            order: { sent_at: 'ASC' },
        });

        await this.messageRepository.update(
            { conversation_id: conversationId, sender_id: Not(userId), read_at: IsNull() },
            { read_at: new Date() },
        );

        return messages.map(msg => ({
            ...msg,
            content: msg.is_deleted ? null : msg.content,
        }));
    }

    async sendMessage(userId: string, conversationId: string, dto: SendMessageDto) {
        const conversation = await this.verifyConversationAccess(userId, conversationId);

        const message = this.messageRepository.create({
            conversation_id: conversationId,
            sender_id: userId,
            content: dto.content ?? null,
            type: dto.type ?? MessageType.TEXT,
        });

        const saved = await this.messageRepository.save(message);

        if (dto.content && this.profanityService.check(dto.content)) {
            this.profanityService.flagUser(userId, '', 'chat').catch(() => {});
        }

        const recipientId = conversation.user_a_id === userId ? conversation.user_b_id : conversation.user_a_id;
        this.notificationsService.notifyNewMessage(recipientId, conversationId).catch(() => {});

        return saved;
    }

    async deleteMessage(userId: string, messageId: string) {
        const message = await this.messageRepository.findOne({
            where: { id: messageId },
        });

        if (!message) throw new NotFoundException('Nachricht nicht gefunden');
        if (message.sender_id !== userId) throw new ForbiddenException('Keine Berechtigung');

        await this.messageRepository.update(messageId, {
            is_deleted: true,
            deleted_at: new Date(),
        });

        return { message: 'Nachricht gelöscht' };
    }

    async disconnectUser(requestingUserId: string, targetUserId: string) {
        const conversation = await this.conversationRepository.findOne({
            where: [
                { user_a_id: requestingUserId, user_b_id: targetUserId },
                { user_a_id: targetUserId, user_b_id: requestingUserId },
            ],
        });

        if (!conversation) throw new NotFoundException('Keine Verbindung gefunden');

        const now = new Date();
        conversation.deleted_at_a = now;
        conversation.deleted_at_b = now;
        conversation.purged_at = now;
        await this.conversationRepository.save(conversation);

        const contactRequest = await this.contactRequestRepository.findOne({
            where: [
                { sender_id: requestingUserId, receiver_id: targetUserId, status: ContactRequestStatus.ACCEPTED },
                { sender_id: targetUserId, receiver_id: requestingUserId, status: ContactRequestStatus.ACCEPTED },
            ],
        });

        if (contactRequest) {
            conversation.contact_request_id = null;
            await this.conversationRepository.save(conversation);
            await this.contactRequestRepository.save({ ...contactRequest, status: ContactRequestStatus.DECLINED });
        }

        return { message: 'Verbindung getrennt' };
    }

    private async verifyConversationAccess(userId: string, conversationId: string) {
        const conversation = await this.conversationRepository.findOne({
            where: [
                { id: conversationId, user_a_id: userId },
                { id: conversationId, user_b_id: userId },
            ],
        });

        if (!conversation) throw new NotFoundException('Konversation nicht gefunden');
        return conversation;
    }
}
