import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { GdprService } from './gdpr.service';
import { GdprController } from './gdpr.controller';
import { JwtGuard } from '../../../common/guards/jwt.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([User]),
    ],
    controllers: [GdprController],
    providers: [GdprService, JwtGuard],
})
export class GdprModule {}
