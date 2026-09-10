import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BeefController } from './beef.controller';
import { BeefService } from './beef.service';
import { BeefGameService } from './beef-game.service';
import { BeefResolutionService } from './beef-resolution.service';
import { BeefStateMachineService } from './beef-state-machine.service';
import { BeefScheduler } from './beef.scheduler';
import { HiddenBeefGateway } from './beef.gateway';
import { GameRegistry } from './games/game.registry';
import { RpsHandler } from './games/rps.handler';
import { TicTacToeHandler } from './games/tictactoe.handler';
import { MastermindHandler } from './games/mastermind.handler';
import { ReactionHandler } from './games/reaction.handler';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { Beef } from './entities/beef.entity';
import { BeefVote } from './entities/beef-vote.entity';
import { BeefComment } from './entities/beef-comment.entity';
import { BeefGame } from './entities/beef-game.entity';
import { User } from '../../core/auth/entities/user.entity';
import { Badge } from '../badge/entities/badge.entity';
import { Tooth } from '../teeth/entities/tooth.entity';
import { CoinModule } from '../coin/coin.module';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { SystemSettingsModule } from '../../core/system-settings/system-settings.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Beef, BeefVote, BeefComment, BeefGame, User, Badge, Tooth]),
        CoinModule,
        NotificationsModule,
        SystemSettingsModule,
    ],
    controllers: [BeefController],
    providers: [
        BeefService,
        BeefGameService,
        BeefResolutionService,
        BeefStateMachineService,
        BeefScheduler,
        HiddenBeefGateway,
        GameRegistry,
        RpsHandler,
        TicTacToeHandler,
        MastermindHandler,
        ReactionHandler,
        JwtGuard,
        {
            provide: 'GAME_HANDLER_REGISTRATION',
            useFactory: (
                registry: GameRegistry,
                rps: RpsHandler,
                ttt: TicTacToeHandler,
                mm: MastermindHandler,
                reaction: ReactionHandler,
            ) => {
                registry.register(rps);
                registry.register(ttt);
                registry.register(mm);
                registry.register(reaction);
            },
            inject: [GameRegistry, RpsHandler, TicTacToeHandler, MastermindHandler, ReactionHandler],
        },
    ],
    exports: [BeefService, BeefGameService],
})
export class BeefModule { }
