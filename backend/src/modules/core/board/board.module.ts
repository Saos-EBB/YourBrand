import { Module } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { ModerationModule } from '../moderation/moderation.module';
import { SharedModule } from '../../shared/shared.module';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';

// Schwarzes Brett (Mandanten-Modul "board"), nur geladen, wenn tenant.json
// es einschaltet — siehe FEATURE_MODULES in app.module.ts.
@Module({
    imports: [ModerationModule, SharedModule],
    controllers: [BoardController],
    providers: [BoardService, JwtGuard],
})
export class BoardModule { }
