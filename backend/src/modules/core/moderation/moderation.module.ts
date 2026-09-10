import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ProfanityService } from './profanity.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Report } from './entities/report.entity';
import { Strike } from './entities/strike.entity';
import { User } from '../auth/entities/user.entity';
import { MediaUpload } from '../media/entities/media-upload.entity';
import { Profile } from '../profile/entities/profile.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AUTO_SUSPEND_QUEUE, DEFAULT_JOB_OPTIONS } from '../../../common/queue/queue.constants';

@Module({
    imports: [
        TypeOrmModule.forFeature([Report, Strike, User, MediaUpload, Profile]),
        NotificationsModule,
        // MailModule/SystemSettingsModule removed: only checkAutoSuspend used
        // them, and that logic now lives in auto-suspend.processor.ts (worker
        // only, see its own module).
        BullModule.registerQueue({ name: AUTO_SUSPEND_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    ],
    controllers: [ModerationController],
    providers: [ModerationService, ProfanityService, JwtGuard, RolesGuard],
    exports: [ProfanityService],
})
export class ModerationModule { }
