import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SystemSettingsService } from '../../core/system-settings/system-settings.service';
import { Beef, BeefStatus } from './entities/beef.entity';
import { BeefVote } from './entities/beef-vote.entity';
import { Badge } from '../badge/entities/badge.entity';
import { Tooth } from '../teeth/entities/tooth.entity';
import { User } from '../../core/auth/entities/user.entity';
import { CoinService } from '../coin/coin.service';
import { NotificationsService } from '../../core/notifications/notifications.service';

export interface CoinDistribution {
    totalPool: number;
    winnerShare: number;
    lotteryPerWinner: number;
    bettorPayouts: { voterId: string; amount: number }[];
}

export interface ResolutionResult {
    isTie: boolean;
    winnerId: string | null;
    loserId: string | null;
    coinDistribution: CoinDistribution;
    correctVoters: BeefVote[];
}

@Injectable()
export class BeefResolutionService {
    constructor(
        @InjectRepository(BeefVote)
        private readonly voteRepo: Repository<BeefVote>,
        @InjectRepository(Badge)
        private readonly badgeRepo: Repository<Badge>,
        @InjectRepository(Tooth)
        private readonly toothRepo: Repository<Tooth>,
        private readonly coinService: CoinService,
        private readonly notificationsService: NotificationsService,
        private readonly eventEmitter: EventEmitter2,
        private readonly dataSource: DataSource,
        private readonly systemSettings: SystemSettingsService,
    ) {}

    async resolve(beef: Beef, gameWinnerId: string | null, random: () => number = Math.random): Promise<void> {
        const votes = await this.voteRepo.find({ where: { beef_id: beef.id } });

        const housePct   = await this.systemSettings.getNumber('beef.split.house_pct', 10);
        const winnerPct  = await this.systemSettings.getNumber('beef.split.winner_pct', 30);
        const bettorsPct = 100 - housePct - winnerPct;
        const chunkPct   = await this.systemSettings.getNumber('beef.split.chunk_pct', 5);
        const maxPerBettorPct = await this.systemSettings.getNumber('beef.split.max_per_bettor_pct', 20);

        const result = this.computeWinner(beef, votes, gameWinnerId, winnerPct, bettorsPct, chunkPct, maxPerBettorPct);
        const badgeDurationMs = beef.duration_seconds * 4 * 1000;
        const exile_until = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.dataSource.transaction(async (manager) => {
            beef.status = BeefStatus.CLOSED;
            beef.winner_id = result.winnerId;
            beef.comment_window_until = new Date(Date.now() + 5 * 60 * 1000);
            await manager.save(beef);

            await manager.update(User, { id: beef.initiator_id }, { exile_until });
            await manager.update(User, { id: beef.target_id },    { exile_until });

            if (result.isTie) {
                const expires_at = new Date(Date.now() + badgeDurationMs);
                await manager.save(this.badgeRepo.create({ user_id: beef.initiator_id, beef_id: beef.id, type: 'loser', expires_at }));
                await manager.save(this.badgeRepo.create({ user_id: beef.target_id,   beef_id: beef.id, type: 'loser', expires_at }));
                await this.notificationsService.notifyBeefLost(beef.initiator_id, beef.id, true);
                await this.notificationsService.notifyBeefLost(beef.target_id,   beef.id, true);
            } else {
                const { winnerId, loserId, coinDistribution, correctVoters } = result;

                if (coinDistribution.winnerShare > 0)
                    await this.coinService.addCoins(winnerId!, coinDistribution.winnerShare, 'earned_win', beef.id, `beef:${beef.id}:winner:${winnerId}`, manager);

                for (const { voterId, amount } of coinDistribution.bettorPayouts) {
                    await this.coinService.addCoins(voterId, amount, 'earned_bet_win', beef.id, `beef:${beef.id}:bet:${voterId}`, manager);
                }

                const expires_at = new Date(Date.now() + badgeDurationMs);
                await manager.save(this.badgeRepo.create({ user_id: winnerId!, beef_id: beef.id, type: 'winner', expires_at }));
                await manager.save(this.badgeRepo.create({ user_id: loserId!,  beef_id: beef.id, type: 'loser',  expires_at }));
                await manager.save(this.toothRepo.create({ owner_id: winnerId!, from_user_id: loserId!, beef_id: beef.id }));

                await this.notificationsService.notifyBeefWon(winnerId!, beef.id, coinDistribution.winnerShare);
                await this.notificationsService.notifyBeefLost(loserId!, beef.id);
            }
        });

        this.eventEmitter.emit('hidden.beef.closed', { beefId: beef.id, winnerId: result.winnerId });
    }

    private computeWinner(
        beef: Pick<Beef, 'initiator_id' | 'target_id' | 'pot_coins'>,
        votes: BeefVote[],
        gameWinnerId: string | null,
        winnerPct: number,
        bettorsPct: number,
        chunkPct: number,
        maxPerBettorPct: number,
    ): ResolutionResult {
        let votePool = 0;
        for (const v of votes) votePool += v.coins_wagered;
        const totalPool = votePool + (beef.pot_coins ?? 0);

        const winnerShare   = Math.floor(totalPool * winnerPct / 100);
        const bettorsPool   = Math.floor(totalPool * bettorsPct / 100);
        const chunkSize     = Math.floor(totalPool * chunkPct / 100);
        const maxPerBettor  = Math.floor(totalPool * maxPerBettorPct / 100);

        if (gameWinnerId === null) {
            return {
                isTie: true,
                winnerId: null,
                loserId: null,
                coinDistribution: { totalPool, winnerShare: 0, lotteryPerWinner: 0, bettorPayouts: [] },
                correctVoters: [],
            };
        }

        const winningSide: 'initiator' | 'target' = gameWinnerId === beef.initiator_id ? 'initiator' : 'target';
        const correctVoters = votes.filter(v => v.side === winningSide);
        const loserId = gameWinnerId === beef.initiator_id ? beef.target_id : beef.initiator_id;

        // Distribute bettorsPool in chunkSize chunks, max maxPerBettor per bettor
        const bettorPayouts: { voterId: string; amount: number }[] = [];
        if (correctVoters.length > 0 && chunkSize > 0) {
            let remaining = bettorsPool;
            const payoutMap = new Map<string, number>();
            for (const v of correctVoters) payoutMap.set(v.voter_id, 0);

            while (remaining >= chunkSize) {
                let distributed = false;
                for (const v of correctVoters) {
                    const current = payoutMap.get(v.voter_id)!;
                    if (current + chunkSize <= maxPerBettor && remaining >= chunkSize) {
                        payoutMap.set(v.voter_id, current + chunkSize);
                        remaining -= chunkSize;
                        distributed = true;
                    }
                }
                if (!distributed) break;
            }
            for (const [voterId, amount] of payoutMap.entries()) {
                if (amount > 0) bettorPayouts.push({ voterId, amount });
            }
        }

        return {
            isTie: false,
            winnerId: gameWinnerId,
            loserId,
            coinDistribution: { totalPool, winnerShare, lotteryPerWinner: chunkSize, bettorPayouts },
            correctVoters,
        };
    }
}
