import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { Notification } from './entities/notification.entity';
import { NotificationSettings } from './entities/notification-settings.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Notification, NotificationSettings]),
    ],
    controllers: [NotificationsController],
    providers: [NotificationsService, JwtGuard],
    exports: [NotificationsService],
})
export class NotificationsModule { }
