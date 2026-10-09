import { Module } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { CareController } from './care.controller';
import { CareService } from './care.service';

// Betreuung (Mandanten-Modul "caretaker"). CareService exportiert, weil
// ChatService die Kontakt-Freigabe darueber anstoesst und OrgModule die
// Mitgliedschaft prueft.
@Module({
    imports: [NotificationsModule, ChatModule],
    controllers: [CareController],
    providers: [CareService, JwtGuard],
    exports: [CareService],
})
export class CareModule { }
