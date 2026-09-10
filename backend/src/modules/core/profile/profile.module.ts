import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from './entities/profile.entity';
import { User } from '../auth/entities/user.entity';
import { Interest } from './entities/interest.entity';
import { UserInterest } from './entities/user-interest.entity';
import { AgbVersion } from './entities/agb-version.entity';
import { ConsentLog } from './entities/consent-log.entity';
import { ProfileSensitiveData } from './entities/profile-sensitive-data.entity';
import { Block } from './entities/block.entity';
import { MediaUpload } from '../media/entities/media-upload.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { OptionalJwtGuard } from '../../../common/guards/optional-jwt.guard';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Profile, User, Interest, UserInterest, AgbVersion, ConsentLog, ProfileSensitiveData, Block, MediaUpload]),
        ModerationModule,
    ],
    controllers: [ProfileController],
    providers: [ProfileService, JwtGuard, OptionalJwtGuard],
})
export class ProfileModule {}
