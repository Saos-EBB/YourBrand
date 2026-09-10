import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { MediaUpload } from '../media/entities/media-upload.entity';
import { Report } from '../moderation/entities/report.entity';
import { Strike } from '../moderation/entities/strike.entity';
import { Profile } from '../profile/entities/profile.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { OwnerGuard } from '../../../common/guards/owner.guard';
import { PseudonymizationTask } from './tasks/pseudonymization.task';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationModule } from '../moderation/moderation.module';
import { MailModule } from '../../../common/mail/mail.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([User, MediaUpload, Report, Strike, Profile]),
        NotificationsModule,
        ModerationModule,
        MailModule,
        SystemSettingsModule,
    ],
    controllers: [AdminController],
    providers: [AdminService, JwtGuard, RolesGuard, OwnerGuard, PseudonymizationTask],
})
export class AdminModule {}
