import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Report } from './entities/report.entity';
import { Strike } from './entities/strike.entity';
import { User } from '../auth/entities/user.entity';
import { FileType, MediaUpload } from '../media/entities/media-upload.entity';
import { Profile } from '../profile/entities/profile.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateStrikeDto, StrikeType } from './dto/create-strike.dto';
import { AUTO_SUSPEND_QUEUE } from '../../../common/queue/queue.constants';

@Injectable()
export class ModerationService {
    constructor(
        @InjectRepository(Report)
        private readonly reportRepository: Repository<Report>,
        @InjectRepository(Strike)
        private readonly strikeRepository: Repository<Strike>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(MediaUpload)
        private readonly mediaUploadRepository: Repository<MediaUpload>,
        @InjectRepository(Profile)
        private readonly profileRepository: Repository<Profile>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly notificationsService: NotificationsService,
        private readonly eventEmitter: EventEmitter2,
        @InjectQueue(AUTO_SUSPEND_QUEUE)
        private readonly autoSuspendQueue: Queue,
    ) { }

    async createReport(reporterId: string, dto: CreateReportDto) {
        if (reporterId === dto.reported_user_id) {
            throw new BadRequestException('Eigene Person kann nicht gemeldet werden');
        }

        const report = this.reportRepository.create({
            reporter_id: reporterId,
            reported_user_id: dto.reported_user_id,
            message_id: dto.message_id ?? null,
            reason: dto.reason,
            description: dto.description ?? null,
            status: 'open',
            intent_category: null,
            reviewed_by: null,
            reviewed_at: null,
        });

        const saved = await this.reportRepository.save(report);

        this.eventEmitter.emit('ticket.new', {});

        await this.autoSuspendQueue.add('check-auto-suspend', {
            reportedUserId: dto.reported_user_id,
            reportId: saved.id,
        });

        return saved;
    }

    // These three back @Roles('admin') routes — a platform-wide moderation
    // queue, not "reports/strikes I personally filed/received". Used to
    // filter on the calling admin's own id (copy-paste from a likely
    // earlier self-service version), so an admin only ever saw their own.
    async getReports() {
        return this.reportRepository.find({
            order: { created_at: 'DESC' },
        });
    }

    async getReport(reportId: string) {
        const report = await this.reportRepository.findOne({ where: { id: reportId } });

        if (!report) throw new NotFoundException('Meldung nicht gefunden');
        return report;
    }

    async getStrikes() {
        return this.strikeRepository.find({
            order: { created_at: 'DESC' },
        });
    }

    async createStrike(adminId: string, dto: CreateStrikeDto) {
        const user = await this.userRepository.findOne({ where: { id: dto.user_id } });
        if (!user) throw new NotFoundException('Benutzer nicht gefunden');

        const report = await this.reportRepository.findOne({ where: { id: dto.report_id } });
        if (!report) throw new NotFoundException('Meldung nicht gefunden');

        if (dto.type === StrikeType.TEMP && !dto.expires_at) {
            throw new BadRequestException('expires_at ist erforderlich bei temporärem Strike');
        }
        if (dto.type === StrikeType.PERMANENT && dto.expires_at) {
            throw new BadRequestException('expires_at darf nicht gesetzt sein bei permanentem Strike');
        }

        const strike = this.strikeRepository.create({
            user_id: dto.user_id,
            report_id: dto.report_id,
            issued_by: adminId,
            type: dto.type,
            reason: dto.reason,
            expires_at: dto.expires_at ?? null,
        });
        await this.strikeRepository.save(strike);

        if (dto.type === StrikeType.TEMP || dto.type === StrikeType.PERMANENT) {
            user.is_banned = true;
            user.ban_reason = dto.reason;
            user.ban_expires_at = dto.expires_at ?? null;
            await this.userRepository.save(user);
        }

        return strike;
    }

    async reviewReport(adminId: string, reportId: string, dto: CreateReviewDto) {
        const report = await this.reportRepository.findOne({ where: { id: reportId } });
        if (!report) throw new NotFoundException('Meldung nicht gefunden');
        if (report.status === 'closed') throw new ForbiddenException('Meldung ist bereits geschlossen');

        report.status = dto.status;
        report.intent_category = dto.intent_category ?? null;
        report.reviewed_by = adminId;
        report.reviewed_at = new Date();

        return this.reportRepository.save(report);
    }

    async getMediaQueue(): Promise<{ id: string; file_url: string; uploaded_at: Date; uploaded_by: string; nickname: string | null }[]> {
        return this.dataSource.query(
            `SELECT m.id, m.file_url, m.uploaded_at, m.uploaded_by, p.nickname
             FROM media_uploads m
             LEFT JOIN profiles p ON p.user_id = m.uploaded_by
             WHERE m.needs_review = true
             ORDER BY m.uploaded_at ASC`,
        );
    }

    async approveMedia(adminId: string, mediaId: string): Promise<void> {
        const media = await this.mediaUploadRepository.findOne({ where: { id: mediaId } });
        if (!media) throw new NotFoundException('Medium nicht gefunden');

        await this.mediaUploadRepository.update(mediaId, {
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
        const media = await this.mediaUploadRepository.findOne({ where: { id: mediaId } });
        if (!media) throw new NotFoundException('Medium nicht gefunden');

        await this.mediaUploadRepository.update(mediaId, {
            reviewed_at: new Date(),
            reviewed_by: adminId,
            review_rejected_reason: reason,
        });

        await this.dataSource.query(
            `DELETE FROM admin_tickets WHERE type = 'image' AND status = 'open' AND context->>'media_id' = $1`,
            [mediaId],
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

        await this.profileRepository.update(
            { user_id: media.uploaded_by, photo_id: mediaId },
            { photo_id: null },
        );
    }
}
