import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationSettings } from './entities/notification-settings.entity';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

const NOTIFICATION_PAGE = 100;

function decodeNotificationCursor(cursor: string): { read: boolean; t: string; id: string } {
    try {
        const [read, t, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        if (typeof read === 'boolean' && typeof t === 'string' && typeof id === 'string') return { read, t, id };
    } catch { /* faellt unten durch */ }
    throw new BadRequestException('Ungueltiger Cursor');
}

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @InjectRepository(NotificationSettings)
        private readonly settingsRepository: Repository<NotificationSettings>,
        private readonly eventEmitter: EventEmitter2,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) { }

    async notifyBeefRequest(userId: string, beefId: string, tldr: string, initiatorNickname: string): Promise<void> {
        await this.createNotification(userId, 'beef_request', 'notifications.beef_request', 'Beef Anfrage', beefId, { nickname: initiatorNickname, tldr });
    }

    async notifyBeefAccepted(userId: string, beefId: string, acceptorNickname: string): Promise<void> {
        await this.createNotification(userId, 'beef_accepted', 'notifications.beef_accepted', 'Beef angenommen', beefId, { nickname: acceptorNickname });
    }

    async notifyBeefWon(userId: string, beefId: string, coinShare: number): Promise<void> {
        await this.createNotification(userId, 'beef_won', 'notifications.beef_won', 'Beef gewonnen', beefId, { coinShare });
    }

    async notifyBeefLost(userId: string, beefId: string, isTie = false): Promise<void> {
        await this.createNotification(
            userId, 'beef_lost',
            isTie ? 'notifications.beef_tie' : 'notifications.beef_lost',
            isTie ? 'Beef beendet' : 'Beef verloren',
            beefId,
            {},
        );
    }

    async notifyNewMessage(userId: string, conversationId: string): Promise<void> {
        await this.createNotification(userId, 'message', 'notifications.new_message', 'Neue Nachricht', conversationId, {});
    }

    async notifyBanTemp(userId: string, reason: string, expiresAt: Date): Promise<void> {
        await this.createNotification(userId, 'ban', 'notifications.ban_temp', 'notifications.ban_temp_title', undefined, { reason, expires_at: expiresAt.toISOString() });
    }

    async notifyBanPermanent(userId: string, reason: string): Promise<void> {
        await this.createNotification(userId, 'ban', 'notifications.ban_permanent', 'notifications.ban_permanent_title', undefined, { reason });
    }

    async notifyBanRevoked(userId: string): Promise<void> {
        await this.createNotification(userId, 'ban', 'notifications.ban_revoked', 'notifications.ban_revoked_title', undefined, {});
    }

    async createNotification(
        userId: string,
        type: NotificationType,
        content: string,
        title?: string | null,
        relatedId?: string,
        contentVars?: Record<string, unknown>,
    ): Promise<void> {
        const [row] = await this.dataSource.query<{ role: string }[]>(
            'SELECT role FROM users WHERE id = $1 LIMIT 1',
            [userId],
        );
        if (row?.role === 'admin') return;

        const notification = this.notificationRepository.create({
            user_id: userId,
            type,
            content,
            title: title ?? null,
            related_id: relatedId ?? null,
            content_vars: contentVars ?? null,
        });
        const saved = await this.notificationRepository.save(notification);
        this.eventEmitter.emit('notification.created', { userId, notification: saved });
    }

    // Seitenweise, ungelesene zuerst, dann neueste. Vorher kamen alle Benachrichtigungen eines Users auf einmal.
    // Der Ungelesen-Zaehler im Frontend stimmt damit bis NOTIFICATION_PAGE ungelesene.
    async getNotifications(userId: string, cursor?: string): Promise<{ data: Notification[]; nextCursor: string | null }> {
        const qb = this.notificationRepository
            .createQueryBuilder('n')
            .addSelect('n.created_at::text', 'cursor_ts')
            .where('n.user_id = :userId', { userId });
        if (cursor) {
            const c = decodeNotificationCursor(cursor);
            qb.andWhere(
                '(n.is_read > :cursorRead OR (n.is_read = :cursorRead AND (n.created_at, n.id) < (CAST(:cursorT AS timestamptz), CAST(:cursorId AS uuid))))',
                { cursorRead: c.read, cursorT: c.t, cursorId: c.id },
            );
        }
        qb.orderBy('n.is_read', 'ASC').addOrderBy('n.created_at', 'DESC').addOrderBy('n.id', 'DESC')
            .limit(NOTIFICATION_PAGE + 1);
        const { entities, raw } = await qb.getRawAndEntities<{ cursor_ts: string }>();
        const data = entities.slice(0, NOTIFICATION_PAGE);
        const last = data.length - 1;
        const nextCursor = entities.length > NOTIFICATION_PAGE && last >= 0
            ? Buffer.from(JSON.stringify([data[last].is_read, raw[last].cursor_ts, data[last].id])).toString('base64url')
            : null;
        return { data, nextCursor };
    }

    async markAsRead(userId: string, notificationId: string) {
        const notification = await this.notificationRepository.findOne({
            where: { id: notificationId },
        });

        if (!notification) throw new NotFoundException('Benachrichtigung nicht gefunden');
        if (notification.user_id !== userId) throw new ForbiddenException('Keine Berechtigung');

        if (!notification.is_read) {
            notification.is_read = true;
            await this.notificationRepository.save(notification);
        }

        return notification;
    }

    async markAllAsRead(userId: string) {
        await this.notificationRepository.update(
            { user_id: userId, is_read: false },
            { is_read: true },
        );

        return { message: 'Alle Benachrichtigungen als gelesen markiert' };
    }

    async deleteNotification(userId: string, notificationId: string): Promise<void> {
        const notification = await this.notificationRepository.findOne({
            where: { id: notificationId, user_id: userId },
        });

        if (!notification) throw new NotFoundException('Benachrichtigung nicht gefunden');

        await this.notificationRepository.remove(notification);
    }

    // Legt die Einstellungen beim ersten Zugriff an. ON CONFLICT DO NOTHING (UNIQUE user_id) statt
    // Lesen-dann-Anlegen: parallele erste Requests desselben Users liefen sonst in einen duplicate key → 500.
    private async ensureSettings(userId: string): Promise<void> {
        await this.settingsRepository
            .createQueryBuilder()
            .insert()
            .into(NotificationSettings)
            .values({ user_id: userId })
            .orIgnore()
            .execute();
    }

    async getSettings(userId: string) {
        const settings = await this.settingsRepository.findOne({ where: { user_id: userId } });
        if (settings) return settings;
        await this.ensureSettings(userId);
        return this.settingsRepository.findOneOrFail({ where: { user_id: userId } });
    }

    async updateSettings(userId: string, dto: UpdateNotificationSettingsDto) {
        await this.ensureSettings(userId);
        await this.settingsRepository.update({ user_id: userId }, { ...dto, updated_at: new Date() });
        return this.settingsRepository.findOneOrFail({ where: { user_id: userId } });
    }
}
