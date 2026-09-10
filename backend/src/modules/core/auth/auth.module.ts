import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Profile } from '../profile/entities/profile.entity';
import { AgbVersion } from '../profile/entities/agb-version.entity';
import { ConsentLog } from '../profile/entities/consent-log.entity';
import { MailModule } from '../../../common/mail/mail.module';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { AgbSeedService } from './seeds/agb.seed';

@Module({
    imports: [
        TypeOrmModule.forFeature([User, RefreshToken, Profile, AgbVersion, ConsentLog]),
        MailModule,
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtGuard, AgbSeedService],
    exports: [AuthService],
})
export class AuthModule { }