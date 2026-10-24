import {
    Injectable,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { BeefResolutionService } from './beef-resolution.service';
import { User } from '../../core/auth/entities/user.entity';
import { Beef, BeefStatus, GameType } from './entities/beef.entity';
import { BeefVote } from './entities/beef-vote.entity';
import { BeefComment } from './entities/beef-comment.entity';
import { BeefGame } from './entities/beef-game.entity';
import { CreateBeefDto } from './dto/create-beef.dto';
import { RespondBeefDto } from './dto/respond-beef.dto';
import { VoteBeefDto } from './dto/vote-beef.dto';
import { CommentBeefDto } from './dto/comment-beef.dto';
import { CoinService } from '../coin/coin.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { BeefStateMachineService, BeefEvent } from './beef-state-machine.service';
import { TypedEventBus, AppEvents } from '../../shared/events/app-events';
import type { BeefGameFinishedEvent } from '../../shared/events/app-events';
import { GameRegistry } from './games/game.registry';
import { SystemSettingsService } from '../../core/system-settings/system-settings.service';

@Injectable()
export class BeefService {
    constructor(
        @InjectRepository(Beef)
        private readonly beefRepo: Repository<Beef>,
        @InjectRepository(BeefVote)
        private readonly voteRepo: Repository<BeefVote>,
        @InjectRepository(BeefComment)
        private readonly commentRepo: Repository<BeefComment>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(BeefGame)
        private readonly gameRepo: Repository<BeefGame>,
        private readonly coinService: CoinService,
        private readonly notificationsService: NotificationsService,
        private readonly typedEventBus: TypedEventBus,
        private readonly dataSource: DataSource,
        private readonly resolutionService: BeefResolutionService,
        private readonly stateMachine: BeefStateMachineService,
        private readonly gameRegistry: GameRegistry,
        private readonly systemSettings: SystemSettingsService,
    ) { }

    async create(initiatorId: string, dto: CreateBeefDto): Promise<Beef> {
        if (initiatorId === dto.target_id)
            throw new BadRequestException('Kein Self-Beef erlaubt');
        const target = await this.userRepo.findOne({
            where: { id: dto.target_id, deleted_at: IsNull() },
        });
        if (!target) throw new NotFoundException('User nicht gefunden');

        // Check initiator not in exile
        const initiator = await this.userRepo.findOne({ where: { id: initiatorId } });
        if (initiator?.exile_until && initiator.exile_until > new Date()) {
            await this.userRepo.update({ id: initiatorId }, { exile_until: null });
        }

        // Check target not in exile
        if (target.exile_until && target.exile_until > new Date()) {
            throw new BadRequestException('Target ist im Exil und kann nicht gebeeft werden.');
        }

        // Check no existing active beef between A-B (either direction)
        const existing = await this.beefRepo
            .createQueryBuilder('b')
            .where(
                `((b.initiator_id = :a AND b.target_id = :b) OR
                  (b.initiator_id = :b AND b.target_id = :a))
                 AND b.status IN ('pending_approval','waiting','active','game_pending','in_game')`,
                { a: initiatorId, b: dto.target_id }
            )
            .getOne();
        if (existing) {
            throw new ConflictException('Es läuft bereits ein Beef zwischen euch.');
        }

        const gameType = dto.game_type ?? GameType.RPS;
        if (!this.gameRegistry.has(gameType))
            throw new BadRequestException(`Unbekannter Game-Typ: ${gameType}`);

        const beef = this.beefRepo.create({
            initiator_id: initiatorId,
            target_id: dto.target_id,
            tldr: dto.tldr,
            chat_passage: dto.chat_passage,
            status: BeefStatus.PENDING_APPROVAL,
            duration_seconds: dto.duration_seconds ?? 86400,
            game_type: gameType,
        });
        const saved = await this.beefRepo.save(beef);
        const entryCost = await this.systemSettings.getNumber('beef.entry_cost', 50);
        try {
            await this.coinService.spendCoins(initiatorId, entryCost, 'spent_beef_open', saved.id, `beef:${saved.id}:open:${initiatorId}`);
        } catch (err) {
            await this.beefRepo.delete({ id: saved.id });
            throw err;
        }
        await this.beefRepo.update({ id: saved.id }, { pot_coins: entryCost });
        return saved;
    }

    @OnEvent(AppEvents.beefGameFinished)
    async onGameFinished(payload: BeefGameFinishedEvent): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: payload.beefId } });
        if (!beef) return;
        this.stateMachine.transition(beef, BeefEvent.CLOSE);
        await this.resolutionService.resolve(beef, payload.winnerId);
    }

    async getPending(): Promise<any[]> {
        return this.beefRepo
            .createQueryBuilder('b')
            .leftJoin('profiles', 'ip', 'ip.user_id = b.initiator_id')
            .leftJoin('profiles', 'tp', 'tp.user_id = b.target_id')
            .where('b.status = :status', { status: BeefStatus.PENDING_APPROVAL })
            .orderBy('b.created_at', 'ASC')
            .select([
                'b.id AS id',
                'b.initiator_id AS initiator_id',
                'b.target_id AS target_id',
                'b.tldr AS tldr',
                'b.chat_passage AS chat_passage',
                'b.status AS status',
                'b.created_at AS created_at',
                'ip.nickname AS initiator_nickname',
                'tp.nickname AS target_nickname',
            ])
            .getRawMany();
    }

    async respond(beefId: string, userId: string, dto: RespondBeefDto): Promise<Beef> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef) throw new NotFoundException('Beef nicht gefunden');
        if (beef.target_id !== userId) throw new ForbiddenException();
        if (beef.status !== BeefStatus.WAITING)
            throw new BadRequestException('Beef nicht im Waiting-Status');
        if (dto.response === 'chicken') {
            await this.chickenBeef(beefId, 'manual');
            return (await this.beefRepo.findOne({ where: { id: beefId } }))!;
        }
        const entryCost = await this.systemSettings.getNumber('beef.entry_cost', 50);
        await this.coinService.spendCoins(userId, entryCost, 'spent_beef_accept', beefId, `beef:${beefId}:accept:${userId}`);
        await this.beefRepo.increment({ id: beefId }, 'pot_coins', entryCost);
        this.stateMachine.transition(beef, BeefEvent.ACCEPT);
        beef.ends_at = new Date(Date.now() + beef.duration_seconds * 1000);
        const [acceptorProfile] = await this.dataSource.query<{ nickname: string }[]>(
            'SELECT nickname FROM profiles WHERE user_id = $1 LIMIT 1',
            [beef.target_id],
        );
        await this.notificationsService.notifyBeefAccepted(beef.initiator_id, beef.id, acceptorProfile?.nickname ?? '');
        return this.beefRepo.save(beef);
    }

    async approve(beefId: string): Promise<Beef> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef) throw new NotFoundException();
        if (beef.status !== BeefStatus.PENDING_APPROVAL)
            throw new BadRequestException('Bereits verarbeitet');
        beef.admin_approved = true;
        this.stateMachine.transition(beef, BeefEvent.APPROVE);
        const saved = await this.beefRepo.save(beef);
        const [initiatorProfile] = await this.dataSource.query<{ nickname: string }[]>(
            'SELECT nickname FROM profiles WHERE user_id = $1 LIMIT 1',
            [beef.initiator_id],
        );
        await this.notificationsService.notifyBeefRequest(beef.target_id, beef.id, beef.tldr, initiatorProfile?.nickname ?? '');
        return saved;
    }

    async listActive(): Promise<Beef[]> {
        return this.beefRepo.find({
            where: { status: BeefStatus.ACTIVE },
            order: { created_at: 'DESC' },
            take: 50,
        });
    }

    async listPublic(userId: string): Promise<Beef[]> {
        return this.beefRepo
            .createQueryBuilder('b')
            .where('b.status IN (:...statuses)', {
                statuses: [BeefStatus.ACTIVE, BeefStatus.GAME_PENDING, BeefStatus.IN_GAME],
            })
            .andWhere('b.initiator_id != :userId AND b.target_id != :userId', { userId })
            .orderBy('b.ends_at', 'ASC')
            .getMany();
    }

    async getById(beefId: string, userId: string): Promise<any> {
        const result = await this.beefRepo
            .createQueryBuilder('b')
            .leftJoin('profiles', 'ip', 'ip.user_id = b.initiator_id')
            .leftJoin('profiles', 'tp', 'tp.user_id = b.target_id')
            .where('b.id = :beefId', { beefId })
            .select([
                'b.id AS id',
                'b.initiator_id AS initiator_id',
                'b.target_id AS target_id',
                'b.tldr AS tldr',
                'b.chat_passage AS chat_passage',
                'b.status AS status',
                'b.winner_id AS winner_id',
                'b.ends_at AS ends_at',
                'b.duration_seconds AS duration_seconds',
                'b.game_type AS game_type',
                'b.game_deadline_at AS game_deadline_at',
                'b.pot_coins AS pot_coins',
                'b.comment_window_until AS comment_window_until',
                'b.created_at AS created_at',
                'ip.nickname AS initiator_nickname',
                'tp.nickname AS target_nickname',
            ])
            .getRawOne();

        if (!result) throw new NotFoundException('Beef nicht gefunden');

        const votes = await this.voteRepo.find({ where: { beef_id: beefId } });
        const initiatorCoins = votes
            .filter(v => v.side === 'initiator')
            .reduce((s, v) => s + v.coins_wagered, 0);
        const targetCoins = votes
            .filter(v => v.side === 'target')
            .reduce((s, v) => s + v.coins_wagered, 0);
        const userVote = votes.find(v => v.voter_id === userId) ?? null;

        return {
            ...result,
            initiator_coins: initiatorCoins,
            target_coins: targetCoins,
            total_votes: votes.length,
            user_vote: userVote ? { side: userVote.side, coins_wagered: userVote.coins_wagered } : null,
        };
    }

    async getHighscore(): Promise<any[]> {
        return this.beefRepo
            .createQueryBuilder('b')
            .innerJoin('profiles', 'p', 'p.user_id = b.winner_id')
            .where('b.status = :status', { status: BeefStatus.CLOSED })
            .andWhere('b.winner_id IS NOT NULL')
            .select([
                'b.winner_id AS user_id',
                'p.nickname AS nickname',
                'COUNT(b.id) AS wins',
            ])
            .groupBy('b.winner_id, p.nickname')
            .orderBy('wins', 'DESC')
            .limit(20)
            .getRawMany()
    }

    // Called by scheduler when ends_at is reached — transitions to game_pending and creates game record
    async startGamePhase(beefId: string): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.ACTIVE) return;

        this.stateMachine.transition(beef, BeefEvent.START_GAME);
        beef.game_deadline_at = new Date(Date.now() + 30 * 60 * 1000);
        // Atomar: nur wer den Wechsel aus ACTIVE wirklich macht, legt das Spiel an (Cron kann parallel laufen).
        // TypeORM liefert fuer UPDATE [rows, rowCount]
        const [, changed] = (await this.beefRepo.query(
            `UPDATE beefs SET status = $2, game_deadline_at = $3 WHERE id = $1 AND status = $4`,
            [beefId, beef.status, beef.game_deadline_at, BeefStatus.ACTIVE],
        )) as [unknown[], number];
        if (!changed) return;

        const handler = this.gameRegistry.get(beef.game_type);
        const initialState = handler.createInitialState(beef.initiator_id, beef.target_id);
        await this.gameRepo.save(this.gameRepo.create({
            beef_id: beefId,
            game_type: beef.game_type,
            state: initialState,
        }));

        // Notify connected clients so the game overlay opens automatically
        this.typedEventBus.emit(AppEvents.beefGameStateUpdate, {
            beefId,
            state: 'waiting',
            gameType: beef.game_type,
            initiatorReady: false,
            targetReady: false,
        });
    }

    async chickenBeef(beefId: string, _reason: 'manual' | 'timeout'): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.WAITING) return;

        this.stateMachine.transition(beef, BeefEvent.CHICKEN);
        const exile_until = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.dataSource.transaction(async (manager) => {
            // Atomar: Zaehler und Exil nur, wenn dieser Lauf den Wechsel aus WAITING wirklich macht
            // (Cron und manuelle Antwort koennen sich ueberschneiden).
            const [, changed] = (await manager.query(
                `UPDATE beefs SET status = $2 WHERE id = $1 AND status = $3`,
                [beefId, beef.status, BeefStatus.WAITING],
            )) as [unknown[], number];
            if (!changed) return;
            await manager.increment(User, { id: beef.target_id }, 'chicken_count', 1);
            // TODO: emit hidden.beef.exile event — Candidate 5 zone boundary
            await manager.update(User, { id: beef.initiator_id }, { exile_until });
            await manager.update(User, { id: beef.target_id },    { exile_until });
        });
    }

    async vote(beefId: string, voterId: string, dto: VoteBeefDto): Promise<BeefVote> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.ACTIVE)
            throw new BadRequestException('Beef nicht aktiv');
        const existing = await this.voteRepo.findOne({
            where: { beef_id: beefId, voter_id: voterId },
        });
        if (existing) throw new ConflictException('Bereits gevotet');
        await this.coinService.spendCoins(voterId, dto.coins_wagered, 'spent_vote', beefId, `beef:${beefId}:vote:${voterId}`);
        const vote = this.voteRepo.create({
            beef_id: beefId,
            voter_id: voterId,
            side: dto.side,
            coins_wagered: dto.coins_wagered,
        });
        const saved = await this.voteRepo.save(vote);
        const allVotes = await this.voteRepo.find({ where: { beef_id: beefId } });
        const iC = allVotes.filter(v => v.side === 'initiator').reduce((s, v) => s + v.coins_wagered, 0);
        const tC = allVotes.filter(v => v.side === 'target').reduce((s, v) => s + v.coins_wagered, 0);
        this.typedEventBus.emit(AppEvents.beefVote, {
            beefId, initiatorCoins: iC, targetCoins: tC, totalVotes: allVotes.length,
        });
        return saved;
    }

    async addComment(beefId: string, userId: string, dto: CommentBeefDto): Promise<BeefComment> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        const commentableStatuses = [BeefStatus.ACTIVE, BeefStatus.GAME_PENDING, BeefStatus.IN_GAME];
        const inCommentWindow = beef?.status === BeefStatus.CLOSED &&
            beef.comment_window_until != null &&
            beef.comment_window_until > new Date();
        if (!beef || (!commentableStatuses.includes(beef.status as BeefStatus) && !inCommentWindow))
            throw new BadRequestException('Beef nicht aktiv');
        const comment = this.commentRepo.create({
            beef_id: beefId,
            user_id: userId,
            content: dto.content,
        });
        const saved = await this.commentRepo.save(comment);
        const count = await this.commentRepo.count({ where: { beef_id: beefId, user_id: userId } });
        if (count <= 3) {
            await this.coinService.addCoins(userId, 5, 'earned_comment', beefId, `beef:${beefId}:comment:${userId}:${count}`);
        }
        this.typedEventBus.emit(AppEvents.beefComment, {
            beefId,
            comment: {
                id: saved.id, user_id: saved.user_id,
                content: saved.content, created_at: saved.created_at,
                nickname: null,
            },
        });
        return saved;
    }

    async getComments(beefId: string): Promise<any[]> {
        return this.commentRepo
            .createQueryBuilder('c')
            .leftJoin('profiles', 'p', 'p.user_id = c.user_id')
            .where('c.beef_id = :beefId', { beefId })
            .orderBy('c.created_at', 'ASC')
            .select([
                'c.id AS id',
                'c.user_id AS user_id',
                'c.content AS content',
                'c.created_at AS created_at',
                'p.nickname AS nickname',
            ])
            .getRawMany();
    }

    async getVotes(beefId: string): Promise<BeefVote[]> {
        return this.voteRepo.find({ where: { beef_id: beefId } });
    }

    async getIncoming(userId: string): Promise<Beef[]> {
        return this.beefRepo.find({
            where: { target_id: userId, status: BeefStatus.WAITING },
            order: { created_at: 'DESC' },
        });
    }

    async getMyActive(userId: string): Promise<Beef[]> {
        return this.beefRepo.find({
            where: [
                { initiator_id: userId, status: BeefStatus.ACTIVE },
                { target_id: userId, status: BeefStatus.ACTIVE },
                { initiator_id: userId, status: BeefStatus.GAME_PENDING },
                { target_id: userId, status: BeefStatus.GAME_PENDING },
                { initiator_id: userId, status: BeefStatus.IN_GAME },
                { target_id: userId, status: BeefStatus.IN_GAME },
            ],
            order: { ends_at: 'ASC' },
        });
    }

    async reject(beefId: string): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef) throw new NotFoundException();
        if (beef.status !== BeefStatus.PENDING_APPROVAL)
            throw new BadRequestException('Nur pending Beefs können abgelehnt werden');
        await this.beefRepo.delete(beefId);
    }

    async leaveExile(userId: string): Promise<void> {
        await this.userRepo.update(
            { id: userId },
            { exile_until: null }
        );
    }

    async getExileStatus(userId: string): Promise<{ in_exile: boolean; exile_until: Date | null }> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        const exile_until = user?.exile_until ?? null;
        const in_exile = exile_until !== null && exile_until > new Date();
        return { in_exile, exile_until };
    }

    // DEV ONLY — skip approval/waiting/active, jump straight to game_pending
    async devQuickFight(initiatorId: string, targetUserId: string, gameType: GameType): Promise<{ beefId: string }> {
        // Close any running beef between these two first
        await this.beefRepo
            .createQueryBuilder()
            .update(Beef)
            .set({ status: BeefStatus.CLOSED })
            .where(
                `((initiator_id = :a AND target_id = :b) OR (initiator_id = :b AND target_id = :a))
                 AND status IN ('pending_approval','waiting','active','game_pending','in_game')`,
                { a: initiatorId, b: targetUserId },
            )
            .execute();

        const beef = this.beefRepo.create({
            initiator_id: initiatorId,
            target_id: targetUserId,
            tldr: '[DEV] Quick Fight',
            chat_passage: 'Dev mode — kein echter Beef',
            status: BeefStatus.GAME_PENDING,
            admin_approved: true,
            duration_seconds: 300,
            game_type: gameType,
            ends_at: new Date(Date.now() + 300_000),
            game_deadline_at: new Date(Date.now() + 30 * 60_000),
        });
        const saved = await this.beefRepo.save(beef);

        const handler = this.gameRegistry.get(gameType);
        const initialState = handler.createInitialState(initiatorId, targetUserId);
        await this.gameRepo.save(this.gameRepo.create({
            beef_id: saved.id,
            game_type: gameType,
            state: initialState,
        }));

        this.typedEventBus.emit(AppEvents.beefGameStateUpdate, {
            beefId: saved.id,
            state: 'waiting',
            gameType,
            initiatorReady: false,
            targetReady: false,
        });

        return { beefId: saved.id };
    }
}
