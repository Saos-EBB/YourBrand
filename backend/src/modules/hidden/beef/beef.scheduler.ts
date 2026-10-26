import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { Beef, BeefStatus } from './entities/beef.entity';
import { BeefGame } from './entities/beef-game.entity';
import { BeefService } from './beef.service';
import { BeefGameService } from './beef-game.service';
import { CronLockService } from '../../../common/redis/cron-lock.service';

@Injectable()
export class BeefScheduler {
    constructor(
        @InjectRepository(Beef)
        private readonly beefRepo: Repository<Beef>,
        @InjectRepository(BeefGame)
        private readonly gameRepo: Repository<BeefGame>,
        private readonly beefService: BeefService,
        private readonly beefGameService: BeefGameService,
        private readonly cronLock: CronLockService,
    ) {}

    @Cron(CronExpression.EVERY_MINUTE)
    async closeExpiredBeefs(): Promise<void> {
        await this.cronLock.runOnce('beef:close-expired', 50_000, async () => {
            const expired = await this.beefRepo.find({
                where: {
                    status: BeefStatus.ACTIVE,
                    ends_at: LessThan(new Date()),
                },
            });
            for (const beef of expired) {
                await this.beefService.startGamePhase(beef.id);
            }
        });
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async handleExpiredReadyWindows(): Promise<void> {
        await this.cronLock.runOnce('beef:ready-timeout', 50_000, async () => {
            const expired = await this.beefRepo.find({
                where: {
                    status: BeefStatus.GAME_PENDING,
                    game_deadline_at: LessThan(new Date()),
                },
            });
            for (const beef of expired) {
                await this.beefGameService.handleReadyTimeout(beef.id);
            }
        });
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async handleExpiredMoveDeadlines(): Promise<void> {
        await this.cronLock.runOnce('beef:move-timeout', 50_000, async () => {
            const expiredGames = await this.gameRepo.find({
                where: {
                    move_deadline_at: LessThan(new Date()),
                    winner_id: IsNull(),
                },
            });
            for (const game of expiredGames) {
                await this.beefGameService.handleMoveTimeout(game.beef_id);
            }
        });
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async autoChickenExpired(): Promise<void> {
        await this.cronLock.runOnce('beef:auto-chicken', 4 * 60_000, async () => {
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const waiting = await this.beefRepo.find({
                where: {
                    status: BeefStatus.WAITING,
                    created_at: LessThan(cutoff),
                },
            });
            for (const beef of waiting) {
                await this.beefService.chickenBeef(beef.id, 'timeout');
            }
        });
    }
}
