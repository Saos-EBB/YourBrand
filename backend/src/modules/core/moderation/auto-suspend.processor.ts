import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Strike } from './entities/strike.entity';
import { User } from '../auth/entities/user.entity';
import { StrikeType } from './dto/create-strike.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../../../common/mail/mail.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { decryptEmail } from '../../../common/crypto/crypto.helper';
import { AUTO_SUSPEND_QUEUE } from '../../../common/queue/queue.constants';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface CheckAutoSuspendJob {
    reportedUserId: string;
    reportId: string;
}

// Registered as a provider ONLY in WorkerModule — never in ModerationModule.
// Every step below is guarded so a BullMQ retry (which re-runs process()
// from scratch) can't double-ban, double-strike, or silently skip the
// strike/notify/mail steps just because the ban already landed on a prior
// attempt — the old inline version's `if (user.is_banned) return` would
// have done exactly that on retry.
@Processor(AUTO_SUSPEND_QUEUE)
export class AutoSuspendProcessor extends WorkerHost {
    private readonly logger = new Logger(AutoSuspendProcessor.name);

    constructor(
        @InjectRepository(Strike)
        private readonly strikeRepository: Repository<Strike>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly notificationsService: NotificationsService,
        private readonly mailService: MailService,
        private readonly eventEmitter: EventEmitter2,
        private readonly systemSettingsService: SystemSettingsService,
    ) {
        super();
    }

    async process(job: Job<CheckAutoSuspendJob>): Promise<void> {
        const { reportedUserId, reportId } = job.data;

        const threshold = await this.systemSettingsService.getNumber('auto_suspend_threshold', 10);

        const result = await this.dataSource.query<[{ count: string }]>(
            `SELECT COUNT(DISTINCT reporter_id) AS count
             FROM reports
             WHERE reported_user_id = $1
               AND status = 'open'
               AND deleted_at IS NULL`,
            [reportedUserId],
        );

        if (parseInt(result[0]?.count ?? '0', 10) < threshold) return;

        const user = await this.userRepository.findOne({ where: { id: reportedUserId } });
        if (!user) return;

        if (!user.is_banned) {
            user.is_banned      = true;
            user.ban_reason     = `Automatische Sperre: ${threshold} unabhängige Meldungen eingegangen.`;
            user.ban_expires_at = null;
            await this.userRepository.save(user);
            this.eventEmitter.emit('user.banned', { userId: reportedUserId });
        }

        // Scoped to this report + SYSTEM_USER_ID so a retry doesn't skip the
        // strike just because an unrelated admin-issued strike already
        // exists for the same report.
        let strike = await this.strikeRepository.findOne({
            where: { report_id: reportId, issued_by: SYSTEM_USER_ID, type: StrikeType.PERMANENT },
        });
        if (!strike) {
            strike = this.strikeRepository.create({
                user_id:    reportedUserId,
                report_id:  reportId,
                issued_by:  SYSTEM_USER_ID,
                type:       StrikeType.PERMANENT,
                reason:     `Auto-Suspend: ${threshold} offene Reports von verschiedenen Nutzern.`,
                expires_at: null,
            });
            await this.strikeRepository.save(strike);
        }

        // Notification/mail stay best-effort (swallowed on failure, like
        // before) — a duplicate notification or email on retry is a minor
        // annoyance, not a correctness bug, unlike a missing ban or strike.
        try {
            await this.notificationsService.notifyBanPermanent(reportedUserId, 'Auto-Suspend');
        } catch (err) {
            this.logger.error(`Auto-Suspend-Notification an ${reportedUserId} fehlgeschlagen`, err);
        }

        const email = decryptEmail(user.email as Buffer | null);
        if (email) {
            try {
                await this.mailService.sendAutoSuspendEmail(email);
            } catch (err) {
                this.logger.error(`Auto-Suspend-E-Mail an ${reportedUserId} fehlgeschlagen`, err);
            }
        }
    }
}
