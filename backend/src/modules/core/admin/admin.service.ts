import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '../../../common/bcrypt/bcrypt-pool.helper';
import * as crypto from 'crypto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { FileType, MediaUpload, ModerationStatus } from '../media/entities/media-upload.entity';
import { Report } from '../moderation/entities/report.entity';
import { Strike } from '../moderation/entities/strike.entity';
import { Profile } from '../profile/entities/profile.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import { decryptEmail, encryptField, hashEmail } from '../../../common/crypto/crypto.helper';
import { ProfanityService } from '../moderation/profanity.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { StrikeType } from '../moderation/dto/create-strike.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateUserEmailDto } from './dto/update-user-email.dto';
import { BanUserDto, BanDuration } from './dto/ban-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { AdminCreateStrikeDto } from './dto/admin-create-strike.dto';
import { AddProfanityWordDto } from './dto/add-profanity-word.dto';
import { SetVulnerableFlagDto } from './dto/set-vulnerable-flag.dto';
import { AdminDashboardStatsDto } from './dto/admin-dashboard-stats.dto';
import { UserDashboardStatsDto } from './dto/user-dashboard-stats.dto';
import { AdminStatsDto } from './dto/admin-stats.dto';
import { ConversationsService } from '../chat/conversations.service';

@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(MediaUpload)
        private readonly mediaRepo: Repository<MediaUpload>,
        @InjectRepository(Report)
        private readonly reportRepo: Repository<Report>,
        @InjectRepository(Strike)
        private readonly strikeRepo: Repository<Strike>,
        @InjectRepository(Profile)
        private readonly profileRepo: Repository<Profile>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly notificationsService: NotificationsService,
        private readonly mailService: MailService,
        private readonly eventEmitter: EventEmitter2,
        private readonly profanityService: ProfanityService,
        private readonly systemSettingsService: SystemSettingsService,
        private readonly conversationsService: ConversationsService,
    ) {}

    private calcBanExpiry(duration: BanDuration): Date | null {
        const ms: Record<Exclude<BanDuration, 'permanent'>, number> = {
            '24h': 1 * 24 * 60 * 60 * 1000,
            '7d':  7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
        };
        return duration === 'permanent' ? null : new Date(Date.now() + ms[duration]);
    }

    // ── Existing ───────────────────────────────────────────────────────────────

    async setVulnerableFlag(userId: string, flag: boolean): Promise<Partial<User>> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');

        user.vulnerable_flag = flag;
        await this.userRepo.save(user);

        const { password_hash, google_id_hash, email_search_hash, email, email_verification_token, password_reset_token, ...safe } = user;
        return safe;
    }

    async exportUserData(userId: string) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');

        const {
            password_hash,
            google_id_hash,
            email_search_hash,
            email,
            email_verification_token,
            email_verification_expires_at,
            password_reset_token,
            password_reset_expires_at,
            ...safeUser
        } = user;

        const [
            profiles,
            userInterests,
            sensitiveRows,
            consentLogs,
            refreshTokens,
            subscriptions,
            paymentLogs,
            notifications,
            reportsSubmitted,
            reportsReceived,
            strikes,
            blocksGiven,
            blocksReceived,
            contactRequestsSent,
            contactRequestsReceived,
            mediaUploads,
            vulnerableFlagAudit,
        ] = await Promise.all([
            this.dataSource.query('SELECT * FROM profiles WHERE user_id = $1', [userId]),
            this.dataSource.query(
                `SELECT ui.id, ui.user_id, ui.created_at, i.name_de, i.name_en, i.category
                 FROM user_interests ui JOIN interests i ON i.id = ui.interest_id
                 WHERE ui.user_id = $1`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT id, user_id, consent_id, disability_visible, collected_at, updated_at
                 FROM profile_sensitive_data WHERE user_id = $1`,
                [userId],
            ),
            this.dataSource.query('SELECT * FROM consent_logs WHERE user_id = $1', [userId]),
            this.dataSource.query(
                `SELECT id, user_id, device_info, expires_at, created_at
                 FROM refresh_tokens WHERE user_id = $1 AND is_revoked = false`,
                [userId],
            ),
            this.dataSource.query('SELECT * FROM subscriptions WHERE user_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM payment_logs WHERE user_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM notifications WHERE user_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM reports WHERE reporter_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM reports WHERE reported_user_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM strikes WHERE user_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM blocks WHERE blocker_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM blocks WHERE blocked_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM contact_requests WHERE sender_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM contact_requests WHERE receiver_id = $1', [userId]),
            this.dataSource.query('SELECT * FROM media_uploads WHERE uploaded_by = $1', [userId]),
            this.dataSource.query('SELECT * FROM vulnerable_flag_audit WHERE user_id = $1', [userId]),
        ]);

        return {
            user: safeUser,
            profiles,
            user_interests: userInterests,
            profile_sensitive_data: sensitiveRows.map((row: any) => ({
                id: row.id,
                user_id: row.user_id,
                consent_id: row.consent_id,
                disability_type: '[verschlüsselt - auf Anfrage]',
                disability_visible: row.disability_visible,
                collected_at: row.collected_at,
                updated_at: row.updated_at,
            })),
            consent_logs: consentLogs,
            refresh_tokens: refreshTokens,
            subscriptions,
            payment_logs: paymentLogs,
            notifications,
            reports_submitted: reportsSubmitted,
            reports_received: reportsReceived,
            strikes,
            blocks_given: blocksGiven,
            blocks_received: blocksReceived,
            contact_requests_sent: contactRequestsSent,
            contact_requests_received: contactRequestsReceived,
            media_uploads: mediaUploads,
            vulnerable_flag_audit: vulnerableFlagAudit,
        };
    }

    // ── Media moderation ───────────────────────────────────────────────────────

    async getMediaPending(): Promise<{ id: string; file_url: string; file_type: string; uploaded_at: Date; uploaded_by: string; nickname: string | null }[]> {
        return this.dataSource.query(
            `SELECT m.id, m.file_url, m.file_type, m.uploaded_at, m.uploaded_by, p.nickname
             FROM   media_uploads m
             LEFT JOIN profiles p ON p.user_id = m.uploaded_by
             WHERE  m.moderation_status = 'pending'
               AND  m.deleted_at IS NULL
             ORDER  BY m.uploaded_at ASC`,
        );
    }

    async approveMedia(adminId: string, mediaId: string): Promise<void> {
        const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
        if (!media) throw new NotFoundException('Medium nicht gefunden');

        await this.mediaRepo.update(mediaId, {
            moderation_status: ModerationStatus.APPROVED,
            needs_review: false,
            reviewed_at: new Date(),
            reviewed_by: adminId,
        });

        await this.dataSource.query(
            `DELETE FROM admin_tickets WHERE type = 'image' AND status = 'open' AND context->>'media_id' = $1`,
            [mediaId],
        );

        await this.notificationsService.createNotification(
            media.uploaded_by,
            'system',
            media.file_type === FileType.AUDIO
                ? 'notifications.media_approved_audio'
                : 'notifications.media_approved_photo',
            undefined,
            undefined,
            {},
        );
    }

    async rejectMedia(adminId: string, mediaId: string, reason: string): Promise<void> {
        const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
        if (!media) throw new NotFoundException('Medium nicht gefunden');

        await this.mediaRepo.update(mediaId, {
            moderation_status: ModerationStatus.REJECTED,
            needs_review: false,
            reviewed_at: new Date(),
            reviewed_by: adminId,
            review_rejected_reason: reason,
        });

        await this.dataSource.query(
            `DELETE FROM admin_tickets WHERE type = 'image' AND status = 'open' AND context->>'media_id' = $1`,
            [mediaId],
        );

        await this.profileRepo.update(
            { user_id: media.uploaded_by, photo_id: mediaId },
            { photo_id: null },
        );

        await this.notificationsService.createNotification(
            media.uploaded_by,
            'system',
            media.file_type === FileType.AUDIO
                ? 'notifications.media_rejected_audio'
                : 'notifications.media_rejected_photo',
            undefined,
            undefined,
            { reason },
        );
    }

    // ── User management ────────────────────────────────────────────────────────

    async getUsers(opts: {
        role?: string;
        is_banned?: boolean;
        search?: string;
        page: number;
        limit: number;
    }) {
        const { role, is_banned, search, page, limit } = opts;
        const offset = (page - 1) * limit;

        const params: (string | boolean | number | null)[] = [];
        const push = (v: string | boolean | number | null) => { params.push(v); return `$${params.length}`; };

        const roleParam    = push(role    ?? null);
        const bannedParam  = push(is_banned ?? null);
        const searchParam  = push(search ? `%${search}%` : null);
        const limitParam   = push(limit);
        const offsetParam  = push(offset);

        const rows = await this.dataSource.query(
            `SELECT u.id, u.role, u.is_banned, u.ban_reason, u.ban_expires_at,
                    u.is_verified, u.vulnerable_flag, u.enhanced_protection,
                    u.created_at, u.last_login, u.deleted_at,
                    p.nickname, p.photo_id
             FROM   users u
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE  (${roleParam}::text   IS NULL OR u.role     = ${roleParam}::user_role)
               AND  (${bannedParam}::boolean IS NULL OR u.is_banned = ${bannedParam}::boolean)
               AND  (${searchParam}::text  IS NULL OR LOWER(p.nickname) LIKE LOWER(${searchParam}::text))
             ORDER  BY u.created_at DESC
             LIMIT  ${limitParam} OFFSET ${offsetParam}`,
            params,
        );

        const [{ total }] = await this.dataSource.query(
            `SELECT COUNT(*) AS total
             FROM   users u
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE  (${roleParam}::text   IS NULL OR u.role     = ${roleParam}::user_role)
               AND  (${bannedParam}::boolean IS NULL OR u.is_banned = ${bannedParam}::boolean)
               AND  (${searchParam}::text  IS NULL OR LOWER(p.nickname) LIKE LOWER(${searchParam}::text))`,
            params.slice(0, 3),
        );

        return { data: rows, total: parseInt(total, 10), page, limit };
    }

    async banUser(adminId: string, requesterRole: string, userId: string, dto: BanUserDto): Promise<{ success: true; ban_expires_at: Date | null; type: 'temp' | 'permanent' }> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');
        if (userId === adminId) throw new BadRequestException('Du kannst deinen eigenen Account nicht sperren.');
        if (user.role === 'owner') throw new ForbiddenException('Owner-Konten können nicht gesperrt werden.');
        if (requesterRole !== 'owner' && user.role === 'admin') throw new ForbiddenException('Admins können keine anderen Admins sperren.');
        if (user.is_banned) throw new BadRequestException('Benutzer ist bereits gesperrt');

        const ban_expires_at = this.calcBanExpiry(dto.duration);
        const type: 'temp' | 'permanent' = dto.duration === 'permanent' ? 'permanent' : 'temp';

        user.is_banned      = true;
        user.ban_reason     = dto.reason;
        user.ban_expires_at = ban_expires_at;
        await this.userRepo.save(user);

        const strike = this.strikeRepo.create({
            user_id:    userId,
            report_id:  dto.report_id ?? null,
            issued_by:  adminId,
            type:       type === 'permanent' ? StrikeType.PERMANENT : StrikeType.TEMP,
            reason:     dto.reason,
            expires_at: ban_expires_at,
        });
        await this.strikeRepo.save(strike);

        if (ban_expires_at) {
            await this.notificationsService.notifyBanTemp(userId, dto.reason, ban_expires_at);
        } else {
            await this.notificationsService.notifyBanPermanent(userId, dto.reason);
        }

        const email = decryptEmail(user.email as Buffer | null);
        if (email) {
            try {
                await this.mailService.sendBanEmail(email, dto.reason, ban_expires_at);
            } catch (err) {
                this.logger.error(`Ban-E-Mail an ${userId} fehlgeschlagen`, err);
            }
        }

        this.eventEmitter.emit('user.banned', { userId });

        return { success: true, ban_expires_at, type };
    }

    async unbanUser(userId: string): Promise<void> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');
        if (!user.is_banned) throw new BadRequestException('Benutzer ist nicht gesperrt');

        user.is_banned      = false;
        user.ban_reason     = null;
        user.ban_expires_at = null;
        await this.userRepo.save(user);

        await this.dataSource.query(
            `UPDATE strikes SET ban_lifted_at = NOW()
             WHERE id = (
                 SELECT id FROM strikes
                 WHERE user_id = $1 AND ban_lifted_at IS NULL AND type != 'warning'
                 ORDER BY created_at DESC
                 LIMIT 1
             )`,
            [userId],
        );

        await this.notificationsService.notifyBanRevoked(userId);

        this.eventEmitter.emit('user.unbanned', { userId });
    }

    async setUserRole(requesterId: string, userId: string, dto: UpdateUserRoleDto): Promise<Partial<User>> {
        if (requesterId === userId) throw new BadRequestException('Du kannst deine eigene Rolle nicht ändern.');

        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');

        if (user.role === 'owner') throw new BadRequestException('Die Owner-Rolle kann nicht geändert werden.');

        user.role = dto.role;
        await this.userRepo.save(user);

        if (dto.role === 'admin') {
            await this.profileRepo.update({ user_id: userId }, { onboarding_completed: true });
        }

        const { password_hash, google_id_hash, email_search_hash, email,
                email_verification_token, password_reset_token, ...safe } = user;
        return safe;
    }

    async createAdminUser(dto: CreateAdminUserDto): Promise<{ id: string; nickname: string; public_id: string }> {
        const emailHash = hashEmail(dto.email);

        const emailTaken = await this.userRepo.findOne({ where: { email_search_hash: emailHash } });
        if (emailTaken) throw new ConflictException('Email bereits vergeben');

        const nicknameTaken = await this.profileRepo.findOne({ where: { nickname: dto.nickname } });
        if (nicknameTaken) throw new ConflictException('Nickname bereits vergeben');

        const passwordHash = await hashPassword(dto.password, 12);
        const public_id = await this.generatePublicId();

        const user = this.userRepo.create({
            email_search_hash: emailHash,
            email: encryptField(dto.email),
            password_hash: passwordHash,
            role: 'admin',
            is_verified: true,
            email_verified_at: new Date(),
            public_id,
        });
        await this.userRepo.save(user);

        const profile = this.profileRepo.create({
            user_id: user.id,
            nickname: dto.nickname,
            birthdate: '1990-01-01',
            onboarding_completed: true,
            updated_at: new Date(),
        });
        await this.profileRepo.save(profile);

        return { id: user.id, nickname: dto.nickname, public_id };
    }

    async sendPasswordReset(userId: string): Promise<{ message: string }> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        await this.userRepo.update(userId, {
            password_reset_token: tokenHash,
            password_reset_expires_at: new Date(Date.now() + 60 * 60 * 1000),
        });

        const email = decryptEmail(user.email as Buffer | null);
        if (email) {
            try {
                await this.mailService.sendPasswordResetEmail(email, token);
            } catch {
            }
        }

        return { message: 'Passwort-Reset-Link wurde gesendet' };
    }

    async updateUserEmail(userId: string, dto: UpdateUserEmailDto): Promise<{ message: string }> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');

        const newEmailHash = hashEmail(dto.new_email);
        const taken = await this.userRepo.findOne({ where: { email_search_hash: newEmailHash } });
        if (taken && taken.id !== userId) throw new ConflictException('Email bereits vergeben');

        // TODO: set is_verified = false once Resend domain is verified
        user.email = encryptField(dto.new_email);
        user.email_search_hash = newEmailHash;
        await this.userRepo.save(user);

        return { message: 'Email aktualisiert' };
    }

    private async generatePublicId(): Promise<string> {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let attempt = 0; attempt < 100; attempt++) {
            const id = Array.from({ length: 4 }, () => charset[Math.floor(Math.random() * 36)]).join('');
            const existing = await this.userRepo.findOne({ where: { public_id: id } });
            if (!existing) return id;
        }
        throw new Error('Could not generate unique public_id');
    }

    async getAdmins(opts: { page: number; limit: number }) {
        const { page, limit } = opts;
        const offset = (page - 1) * limit;

        const rows = await this.dataSource.query(
            `SELECT u.id, u.role, u.is_banned, u.is_verified, u.created_at, u.last_login,
                    p.nickname, p.photo_id
             FROM   users u
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE  u.role = 'admin'
             ORDER  BY u.created_at DESC
             LIMIT  $1 OFFSET $2`,
            [limit, offset],
        );

        const [{ total }] = await this.dataSource.query(
            `SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`,
        );

        return { data: rows, total: parseInt(total, 10), page, limit };
    }

    // ── Reports ────────────────────────────────────────────────────────────────

    async getAdminReports(opts: { status?: string; page: number; limit: number }) {
        const { status, page, limit } = opts;
        const offset = (page - 1) * limit;

        const rows = await this.dataSource.query(
            `SELECT r.*,
                    rp.nickname  AS reporter_nickname,
                    rpd.nickname AS reported_nickname
             FROM   reports r
             LEFT JOIN profiles rp  ON rp.user_id  = r.reporter_id
             LEFT JOIN profiles rpd ON rpd.user_id = r.reported_user_id
             WHERE  ($1::text IS NULL OR r.status = $1::report_status)
               AND  r.deleted_at IS NULL
             ORDER  BY r.created_at DESC
             LIMIT  $2 OFFSET $3`,
            [status ?? null, limit, offset],
        );

        const [{ total }] = await this.dataSource.query(
            `SELECT COUNT(*) AS total FROM reports
             WHERE ($1::text IS NULL OR status = $1::report_status) AND deleted_at IS NULL`,
            [status ?? null],
        );

        return { data: rows, total: parseInt(total, 10), page, limit };
    }

    async updateReport(adminId: string, reportId: string, dto: UpdateReportDto): Promise<Report> {
        const report = await this.reportRepo.findOne({ where: { id: reportId } });
        if (!report) throw new NotFoundException('Meldung nicht gefunden');
        if (report.status === 'closed') throw new BadRequestException('Meldung ist bereits geschlossen');

        report.status      = dto.status;
        report.reviewed_by = adminId;
        report.reviewed_at = new Date();
        if (dto.note !== undefined) report.note = dto.note;

        return this.reportRepo.save(report);
    }

    // ── Strikes ────────────────────────────────────────────────────────────────

    async getAdminStrikes(opts: { page: number; limit: number }) {
        const { page, limit } = opts;
        const offset = (page - 1) * limit;

        const rows = await this.dataSource.query(
            `SELECT s.*, p.nickname AS user_nickname
             FROM   strikes s
             LEFT JOIN profiles p ON p.user_id = s.user_id
             ORDER  BY s.created_at DESC
             LIMIT  $1 OFFSET $2`,
            [limit, offset],
        );

        const [{ total }] = await this.dataSource.query('SELECT COUNT(*) AS total FROM strikes');

        return { data: rows, total: parseInt(total, 10), page, limit };
    }

    async createAdminStrike(adminId: string, dto: AdminCreateStrikeDto): Promise<Strike> {
        if (dto.type === StrikeType.TEMP && !dto.expires_at) {
            throw new BadRequestException('expires_at ist erforderlich bei temporärem Strike');
        }
        if (dto.type === StrikeType.PERMANENT && dto.expires_at) {
            throw new BadRequestException('expires_at darf nicht gesetzt sein bei permanentem Strike');
        }

        const user = await this.userRepo.findOne({ where: { id: dto.user_id } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');

        const strike = this.strikeRepo.create({
            user_id:   dto.user_id,
            report_id: null,
            issued_by: adminId,
            type:      dto.type,
            reason:    dto.reason,
            expires_at: dto.expires_at ?? null,
        });
        await this.strikeRepo.save(strike);

        if (dto.type === StrikeType.TEMP || dto.type === StrikeType.PERMANENT) {
            user.is_banned      = true;
            user.ban_reason     = dto.reason;
            user.ban_expires_at = dto.expires_at ?? null;
            await this.userRepo.save(user);

            if (dto.type === StrikeType.PERMANENT) {
                await this.notificationsService.notifyBanPermanent(dto.user_id, dto.reason);
            } else {
                await this.notificationsService.notifyBanTemp(dto.user_id, dto.reason, dto.expires_at!);
            }
        }

        return strike;
    }

    // ── Profanity word list ────────────────────────────────────────────────────

    getProfanityWords() {
        return this.profanityService.getCustomWords();
    }

    addProfanityWord(dto: AddProfanityWordDto, adminId: string) {
        return this.profanityService.addCustomWord(dto.word, adminId);
    }

    removeProfanityWord(word: string) {
        return this.profanityService.removeCustomWord(word);
    }

    // ── Direct conversations (admin → user) ────────────────────────────────────

    async createDirectConversation(adminId: string, targetUserId: string): Promise<{ conversation_id: string }> {
        if (adminId === targetUserId) throw new BadRequestException('Ungültige Anfrage');

        const conversation = await this.conversationsService.getOrCreate(adminId, targetUserId);
        return { conversation_id: conversation.id };
    }

    // ── Admin tickets ──────────────────────────────────────────────────────────

    async getAdminTickets(opts: { type?: string; status?: string; page: number; limit: number }) {
        const { type, status, page, limit } = opts;
        const offset = (page - 1) * limit;

        const rows = await this.dataSource.query(
            `SELECT id, type, status, source, context, created_at, updated_at
             FROM   admin_tickets
             WHERE  ($1::text IS NULL OR type   = $1::ticket_type)
               AND  ($2::text IS NULL OR status = $2::ticket_status)
             ORDER  BY created_at DESC
             LIMIT  $3 OFFSET $4`,
            [type ?? null, status ?? null, limit, offset],
        );

        const [{ total }] = await this.dataSource.query(
            `SELECT COUNT(*) AS total FROM admin_tickets
             WHERE ($1::text IS NULL OR type   = $1::ticket_type)
               AND ($2::text IS NULL OR status = $2::ticket_status)`,
            [type ?? null, status ?? null],
        );

        return { data: rows, total: parseInt(total, 10), page, limit };
    }

    async updateAdminTicketStatus(id: string, status: string): Promise<void> {
        await this.dataSource.query(
            `UPDATE admin_tickets SET status = $1::ticket_status, updated_at = NOW() WHERE id = $2`,
            [status, id],
        );
    }

    // ── System settings ────────────────────────────────────────────────────────

    getSettings() {
        return this.systemSettingsService.getAll();
    }

    updateSetting(key: string, value: string, adminId: string) {
        return this.systemSettingsService.set(key, value, adminId);
    }

    // ── Dashboard stats (owner only) ───────────────────────────────────────────

    async getDashboardStats(): Promise<AdminDashboardStatsDto> {
        const [
            [totalUsersRow],
            [activeUsersRow],
            [bannedUsersRow],
            [newUsersTodayRow],
            [newUsersThisWeekRow],
            [activeSubscriptionsRow],
            [totalRevenueRow],
            [onlineUsersRow],
            [messagesTodayRow],
            [messagesThisWeekRow],
            [contactRequestsTodayRow],
            [contactRequestsThisWeekRow],
            [openReportsRow],
            [strikesThisWeekRow],
            [openTicketsRow],
            [pendingMediaRow],
        ] = await Promise.all([
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL AND is_banned = false AND is_verified = true`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM users WHERE is_banned = true`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM users WHERE created_at >= DATE_TRUNC('day', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM users WHERE created_at >= DATE_TRUNC('week', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM subscriptions WHERE status = 'active'`,
            ),
            this.dataSource.query<{ total: string }[]>(
                `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_logs WHERE status = 'success'`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM profiles WHERE last_active_at > NOW() - INTERVAL '15 minutes'`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM messages WHERE sent_at >= DATE_TRUNC('day', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM messages WHERE sent_at >= DATE_TRUNC('week', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM contact_requests WHERE created_at >= DATE_TRUNC('day', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM contact_requests WHERE created_at >= DATE_TRUNC('week', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM reports WHERE status = 'open'`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM strikes WHERE created_at >= DATE_TRUNC('week', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM admin_tickets WHERE status = 'open'`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM media_uploads WHERE moderation_status = 'pending'`,
            ),
        ]);

        return {
            totalUsers:              parseInt(totalUsersRow.count, 10),
            activeUsers:             parseInt(activeUsersRow.count, 10),
            bannedUsers:             parseInt(bannedUsersRow.count, 10),
            newUsersToday:           parseInt(newUsersTodayRow.count, 10),
            newUsersThisWeek:        parseInt(newUsersThisWeekRow.count, 10),
            activeSubscriptions:     parseInt(activeSubscriptionsRow.count, 10),
            totalRevenue:            parseFloat(totalRevenueRow.total),
            onlineUsers:             parseInt(onlineUsersRow.count, 10),
            messagesToday:           parseInt(messagesTodayRow.count, 10),
            messagesThisWeek:        parseInt(messagesThisWeekRow.count, 10),
            contactRequestsToday:    parseInt(contactRequestsTodayRow.count, 10),
            contactRequestsThisWeek: parseInt(contactRequestsThisWeekRow.count, 10),
            openReports:             parseInt(openReportsRow.count, 10),
            strikesThisWeek:         parseInt(strikesThisWeekRow.count, 10),
            openTickets:             parseInt(openTicketsRow.count, 10),
            pendingMedia:            parseInt(pendingMediaRow.count, 10),
        };
    }

    // ── User dashboard stats (any authenticated user) ──────────────────────────

    async getUserDashboardStats(userId: string): Promise<UserDashboardStatsDto> {
        const [
            [pendingRequestsRow],
            [activeConversationsRow],
            subRows,
        ] = await Promise.all([
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM contact_requests WHERE receiver_id = $1 AND status = 'pending'`,
                [userId],
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM conversations WHERE ((user_a_id = $1 AND deleted_at_a IS NULL) OR (user_b_id = $1 AND deleted_at_b IS NULL)) AND purged_at IS NULL`,
                [userId],
            ),
            this.dataSource.query<{ plan: string; status: string; expires_at: string | null }[]>(
                `SELECT plan, status, expires_at FROM subscriptions WHERE user_id = $1 AND status IN ('active') ORDER BY started_at DESC LIMIT 1`,
                [userId],
            ),
        ]);

        return {
            pendingRequests:     parseInt(pendingRequestsRow.count, 10),
            activeConversations: parseInt(activeConversationsRow.count, 10),
            subscription:        subRows[0]
                ? { plan: subRows[0].plan, status: subRows[0].status, expires_at: subRows[0].expires_at }
                : null,
        };
    }

    // ── Admin stats (admin + owner) ────────────────────────────────────────────

    async getAdminStats(): Promise<AdminStatsDto> {
        const [
            [openReportsRow],
            [openTicketsRow],
            [strikesThisWeekRow],
            [pendingMediaRow],
        ] = await Promise.all([
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM reports WHERE status = 'open'`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM admin_tickets WHERE status = 'open'`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM strikes WHERE created_at >= DATE_TRUNC('week', NOW())`,
            ),
            this.dataSource.query<{ count: string }[]>(
                `SELECT COUNT(*) AS count FROM media_uploads WHERE moderation_status = 'pending'`,
            ),
        ]);

        return {
            openReports:     parseInt(openReportsRow.count, 10),
            openTickets:     parseInt(openTicketsRow.count, 10),
            strikesThisWeek: parseInt(strikesThisWeekRow.count, 10),
            pendingMedia:    parseInt(pendingMediaRow.count, 10),
        };
    }

    // ── Owner: coin & cash transactions ───────────────────────────────────────

    async getCoinTransactions(): Promise<unknown[]> {
        return this.dataSource.query(`
            SELECT
                ct.id,
                ct.user_id,
                p.nickname,
                ct.amount,
                ct.type  AS reason,
                ct.created_at
            FROM coin_transactions ct
            LEFT JOIN profiles p ON p.user_id = ct.user_id
            ORDER BY ct.created_at DESC
        `);
    }

    async getCashTransactions(): Promise<unknown[]> {
        return this.dataSource.query(`
            SELECT
                pl.id,
                pl.user_id,
                p.nickname,
                pl.amount,
                pl.currency,
                pl.status,
                pl.created_at
            FROM payment_logs pl
            LEFT JOIN profiles p ON p.user_id = pl.user_id
            ORDER BY pl.created_at DESC
        `);
    }
}
