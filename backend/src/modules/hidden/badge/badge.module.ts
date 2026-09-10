import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadgeController } from './badge.controller';
import { BadgeService } from './badge.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { Badge } from './entities/badge.entity';
import { User } from '../../core/auth/entities/user.entity';
import { Beef } from '../beef/entities/beef.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Badge, User, Beef]),
    ],
    controllers: [BadgeController],
    providers: [BadgeService, JwtGuard],
    exports: [BadgeService],
})
export class BadgeModule { }
