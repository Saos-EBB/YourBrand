import {
    Inject,
    Injectable,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import { GameRegistry } from './games/game.registry';
import { TicTacToeHandler } from './games/tictactoe.handler';
import { BeefGame } from './entities/beef-game.entity';
import { Beef, BeefStatus } from './entities/beef.entity';
import { BeefStateMachineService, BeefEvent } from './beef-state-machine.service';
import { SystemSettingsService } from '../../core/system-settings/system-settings.service';
import { TypedEventBus, AppEvents } from '../../shared/events/app-events';

const GAME_DEADLINE_SECONDS = 30 * 60; // 30 minutes

// Safety-net TTL for the reaction-ready handshake — cleans up the Redis set if
// one player never shows up (no explicit deadline exists for this phase).
const REACTION_READY_TTL_SECONDS = 5 * 60;

@Injectable()
export class BeefGameService {
    // Per-beef in-memory turn timers for TicTacToe (25 s → random placement).
    // Stays in-process (a JS timer handle can't live in Redis) — safe under
    // horizontal scaling because applyRandomTttMove re-checks move_deadline_at
    // (the shared, DB-backed truth) before acting, so a stale timer on an
    // instance that didn't see a later move just no-ops.
    private readonly tttTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
    constructor(
        @InjectRepository(BeefGame)
        private readonly gameRepo: Repository<BeefGame>,
        @InjectRepository(Beef)
        private readonly beefRepo: Repository<Beef>,
        private readonly registry: GameRegistry,
        private readonly stateMachine: BeefStateMachineService,
        private readonly systemSettings: SystemSettingsService,
        private readonly eventBus: TypedEventBus,
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
    ) {}

    async pressReady(beefId: string, userId: string): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef) throw new NotFoundException('Beef nicht gefunden');
        if (beef.status !== BeefStatus.GAME_PENDING)
            throw new BadRequestException('Beef nicht im game_pending Status');

        const isInitiator = beef.initiator_id === userId;
        const isTarget = beef.target_id === userId;
        if (!isInitiator && !isTarget) throw new ForbiddenException();

        let game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
        if (!game) throw new NotFoundException('Beef-Game nicht gefunden');

        if (isInitiator) game.initiator_ready = true;
        if (isTarget) game.target_ready = true;

        if (game.initiator_ready && game.target_ready) {
            const timeoutSec = await this.systemSettings.getNumber('game.move_timeout_seconds', 180);
            game.move_deadline_at = new Date(Date.now() + timeoutSec * 1000);
            game = await this.gameRepo.save(game);

            this.stateMachine.transition(beef, BeefEvent.BEGIN_FIGHT);
            await this.beefRepo.save(beef);

            // For reaction: GO is NOT scheduled here. It fires via markReactionReady()
            // once both ReactionGame components have mounted and registered their listeners.

            this.eventBus.emit(AppEvents.beefGameStateUpdate, {
                beefId,
                state: 'in_game',
                gameType: game.game_type,
                initiatorReady: game.initiator_ready,
                targetReady: game.target_ready,
            });
        } else {
            await this.gameRepo.save(game);
            this.eventBus.emit(AppEvents.beefGameStateUpdate, {
                beefId,
                state: 'waiting',
                gameType: game.game_type,
                initiatorReady: game.initiator_ready,
                targetReady: game.target_ready,
            });
        }
    }

    async markReactionReady(beefId: string, userId: string): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.IN_GAME || beef.game_type !== 'reaction') return;
        const isInitiator = beef.initiator_id === userId;
        const isTarget = beef.target_id === userId;
        if (!isInitiator && !isTarget) return;

        // SADD is a no-op if userId is already a member — safe against duplicate
        // presses. Set can only ever hold initiator_id/target_id (checked above),
        // so size 2 means both are in.
        const readyKey = `beef:${beefId}:reaction_ready`;
        await this.redis.sadd(readyKey, userId);
        await this.redis.expire(readyKey, REACTION_READY_TTL_SECONDS);

        const readyCount = await this.redis.scard(readyKey);
        if (readyCount >= 2) {
            await this.redis.del(readyKey);
            const delayMs = Math.floor(Math.random() * 4800) + 200;
            setTimeout(() => void (async () => {
                const sentAt = Date.now();
                // Persist go_sent_at BEFORE broadcasting so the handler can
                // calculate reaction time on the first click that arrives.
                const game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
                if (game) {
                    game.state = { ...game.state, go_sent_at: sentAt };
                    await this.gameRepo.save(game);
                }
                this.eventBus.emit(AppEvents.beefGameGo, { beefId, sentAt });
            })(), delayMs);
        }
    }

    async applyMove(beefId: string, userId: string, move: Record<string, any>): Promise<BeefGame> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef) throw new NotFoundException('Beef nicht gefunden');
        if (beef.status !== BeefStatus.IN_GAME)
            throw new BadRequestException('Beef nicht in_game');

        const isInitiator = beef.initiator_id === userId;
        const isTarget = beef.target_id === userId;
        if (!isInitiator && !isTarget) throw new ForbiddenException();

        const game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
        if (!game) throw new NotFoundException('Game nicht gefunden');

        if (game.move_deadline_at && game.move_deadline_at < new Date())
            throw new BadRequestException('Move-Deadline abgelaufen');

        // Cancel any pending auto-placement timer for this beef
        if (beef.game_type === 'tictactoe') this.clearTttTimer(beefId);

        const handler = this.registry.get(beef.game_type);
        const role = isInitiator ? 'initiator' : 'target';
        const playerToMove = handler.getPlayerToMove(game.state, beef.initiator_id, beef.target_id);

        if (handler.realtime === false && playerToMove !== userId)
            throw new BadRequestException('Nicht dein Zug');

        // Inject server-side timestamp for mastermind (prevents client time manipulation)
        const sanitizedMove = beef.game_type === 'mastermind'
            ? { ...move, submitted_at: Date.now() }
            : move;

        const { newState, finished } = handler.applyMove(game.state, sanitizedMove, role);
        game.state = newState;

        const board = handler.shapeBoardUpdate(newState, beef.initiator_id, beef.target_id, finished);
        this.eventBus.emit(AppEvents.beefGameBoardUpdate, {
            beefId,
            gameType: beef.game_type,
            board,
            finished,
            // Mastermind needs player IDs so the gateway can redact per-socket
            ...(beef.game_type === 'mastermind' && {
                initiatorId: beef.initiator_id,
                targetId: beef.target_id,
            }),
        });

        if (finished) {
            const winnerId = handler.getWinner(newState, beef.initiator_id, beef.target_id);
            game.winner_id = winnerId;
            game.move_deadline_at = null;
            await this.gameRepo.save(game);
            this.eventBus.emit(AppEvents.beefGameFinished, { beefId, winnerId });
        } else if (board.round_over) {
            // Round ended, series continues — hold the winning board for 2.5 s then reset
            game.move_deadline_at = null;
            await this.gameRepo.save(game);
            setTimeout(() => void this.advanceToNextRound(beefId, beef.initiator_id, beef.target_id), 2500);
        } else {
            // TicTacToe uses a 25 s in-memory timer for random placement on expiry.
            // Other games use the configurable systemSettings timeout (backstop only for TicTacToe).
            const timeoutSec = beef.game_type === 'tictactoe'
                ? 25
                : await this.systemSettings.getNumber('game.move_timeout_seconds', 180);
            game.move_deadline_at = new Date(Date.now() + timeoutSec * 1000);
            await this.gameRepo.save(game);
            if (beef.game_type === 'tictactoe') {
                this.scheduleTttTimer(beefId, beef.initiator_id, beef.target_id);
            }
        }

        return game;
    }

    // Called by gateway for reaction test clicks — move.received_at_ms set by server
    async applyReactionClick(beefId: string, userId: string, receivedAtMs: number): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.IN_GAME || beef.game_type !== 'reaction') return;

        const isInitiator = beef.initiator_id === userId;
        const isTarget = beef.target_id === userId;
        if (!isInitiator && !isTarget) return;

        const role = isInitiator ? 'initiator' : 'target';
        await this.applyMove(beefId, userId, { received_at_ms: receivedAtMs });
    }

    async getGame(beefId: string): Promise<Record<string, any> | null> {
        const game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
        if (!game) return null;
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef) return null;

        const state: 'waiting' | 'in_game' | 'finished' =
            game.winner_id !== null ? 'finished' :
            (game.initiator_ready && game.target_ready) ? 'in_game' :
            'waiting';

        const handler = this.registry.get(game.game_type);
        const board = game.state
            ? handler.shapeBoardUpdate(game.state, beef.initiator_id, beef.target_id, state === 'finished')
            : {};

        return {
            state,
            game_type: game.game_type,
            initiator_ready: game.initiator_ready,
            target_ready: game.target_ready,
            move_deadline_at: game.move_deadline_at,
            winner_id: game.winner_id,
            ...board,
        };
    }

    async handleMoveTimeout(beefId: string): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.IN_GAME) return;

        const game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
        if (!game || !game.move_deadline_at || game.move_deadline_at > new Date()) return;

        // TicTacToe: random placement (backstop for server restarts — in-memory timer
        // handles the normal 25 s path; this cron only fires if the timer was lost).
        if (beef.game_type === 'tictactoe') {
            await this.applyRandomTttMove(beefId, beef.initiator_id, beef.target_id);
            return;
        }

        // Other games: player who was supposed to move forfeits
        const handler = this.registry.get(beef.game_type);
        const playerToMove = handler.getPlayerToMove(game.state, beef.initiator_id, beef.target_id);
        const winnerId = playerToMove === beef.initiator_id ? beef.target_id : beef.initiator_id;

        game.winner_id = winnerId;
        game.move_deadline_at = null;
        await this.gameRepo.save(game);
        this.eventBus.emit(AppEvents.beefGameFinished, { beefId, winnerId });
    }

    private async advanceToNextRound(beefId: string, initiatorId: string, targetId: string): Promise<void> {
        const game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
        if (!game || !game.state?.round_over) return;

        const handler = this.registry.get('tictactoe') as TicTacToeHandler;
        const nextState = handler.startNextRound(game.state as any);
        game.state = nextState;
        const timeoutSec = await this.systemSettings.getNumber('game.move_timeout_seconds', 180);
        game.move_deadline_at = new Date(Date.now() + timeoutSec * 1000);
        await this.gameRepo.save(game);

        const resetBoard = handler.shapeBoardUpdate(nextState, initiatorId, targetId, false);
        this.eventBus.emit(AppEvents.beefGameBoardUpdate, {
            beefId,
            gameType: 'tictactoe',
            board: resetBoard,
            finished: false,
        });
        this.scheduleTttTimer(beefId, initiatorId, targetId);
    }

    // ── TicTacToe per-turn timer ────────────────────────────────────────────

    private clearTttTimer(beefId: string): void {
        const t = this.tttTurnTimers.get(beefId);
        if (t !== undefined) { clearTimeout(t); this.tttTurnTimers.delete(beefId); }
    }

    private scheduleTttTimer(beefId: string, initiatorId: string, targetId: string): void {
        this.clearTttTimer(beefId);
        const timer = setTimeout(() => {
            void this.applyRandomTttMove(beefId, initiatorId, targetId);
        }, 25_000);
        this.tttTurnTimers.set(beefId, timer);
    }

    private async applyRandomTttMove(beefId: string, initiatorId: string, targetId: string): Promise<void> {
        this.clearTttTimer(beefId);

        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.IN_GAME || beef.game_type !== 'tictactoe') return;

        const game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
        if (!game || game.winner_id || !game.state) return;

        // This timer is local to whichever instance held the beef when the turn
        // started. If a real move landed on a different instance in the meantime,
        // move_deadline_at has already moved forward (or been cleared) — treat
        // that exactly like the cron backstop does and no-op instead of forcing
        // a second, stale placement on top of the real move.
        if (!game.move_deadline_at || game.move_deadline_at > new Date()) return;

        const state = game.state as { board: (string | null)[]; turn: 'initiator' | 'target'; round_over: boolean; winner_id: string | null };
        if (state.round_over || state.winner_id) return;

        const emptyCells = (state.board as (string | null)[])
            .map((cell, i) => (cell === null ? i : -1))
            .filter((i) => i !== -1);
        if (emptyCells.length === 0) return;

        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const playerToMove = state.turn === 'initiator' ? initiatorId : targetId;

        // Clear deadline so applyMove doesn't reject the move as expired
        game.move_deadline_at = null;
        await this.gameRepo.save(game);

        await this.applyMove(beefId, playerToMove, { position: randomCell });
    }

    async handleReadyTimeout(beefId: string): Promise<void> {
        const beef = await this.beefRepo.findOne({ where: { id: beefId } });
        if (!beef || beef.status !== BeefStatus.GAME_PENDING) return;
        if (!beef.game_deadline_at || beef.game_deadline_at > new Date()) return;

        const game = await this.gameRepo.findOne({ where: { beef_id: beefId } });
        if (!game) return;

        let winnerId: string | null = null;
        if (game.initiator_ready && !game.target_ready) winnerId = beef.initiator_id;
        else if (game.target_ready && !game.initiator_ready) winnerId = beef.target_id;
        // neither ready → null = tie

        game.winner_id = winnerId;
        await this.gameRepo.save(game);
        this.eventBus.emit(AppEvents.beefGameFinished, { beefId, winnerId });
    }
}
