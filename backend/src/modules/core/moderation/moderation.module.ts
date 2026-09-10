import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { MailModule } from '../../../common/mail/mail.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Report, Strike, User, MediaUpload, Profile]),
        NotificationsModule,
        MailModule,
        SystemSettingsModule,
    ],
    controllers: [ModerationController],
    providers: [ModerationService, ProfanityService, JwtGuard, RolesGuard],
    exports: [ProfanityService],
})
export class ModerationModule { }
