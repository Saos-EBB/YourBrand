import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { Swipe, SwipeAction } from './entities/swipe.entity';
import { Match } from './entities/match.entity';
import { ConversationsService } from '../chat/conversations.service';
import { Profile } from '../profile/entities/profile.entity';
import { Subscription } from '../payment/entities/subscription.entity';
import { SwipeDto } from './dto/swipe.dto';

const FREE_SWIPE_LIMIT = 20;

@Injectable()
export class SwipeService {
    constructor(
        @InjectRepository(Swipe)
        private readonly swipeRepo: Repository<Swipe>,
        @InjectRepository(Match)
        private readonly matchRepo: Repository<Match>,
        private readonly conversationsService: ConversationsService,
        @InjectRepository(Profile)
        private readonly profileRepo: Repository<Profile>,
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    async swipe(
        swiperId: string,
        dto: SwipeDto,
    ): Promise<{ matched: boolean; conversation_id: string | null }> {
        if (swiperId === dto.target_user_id) {
            throw new BadRequestException('Cannot swipe yourself.');
        }

        await this.enforceSwipeLimit(swiperId);

        const targetExists = await this.profileRepo.findOne({
            where: { user_id: dto.target_user_id, is_published: true },
            select: { user_id: true },
        });
        if (!targetExists) throw new NotFoundException('User not found.');

        // Upsert the swipe (re-swiping overwrites previous decision)
        await this.dataSource.query(
            `INSERT INTO swipes (swiper_id, swiped_id, action, swiped_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (swiper_id, swiped_id)
             DO UPDATE SET action = EXCLUDED.action, swiped_at = NOW()`,
            [swiperId, dto.target_user_id, dto.action],
        );

        if (dto.action !== SwipeAction.LIKE) {
            return { matched: false, conversation_id: null };
        }

        // Check mutual like
        const theyLikedMe = await this.swipeRepo.findOne({
            where: {
                swiper_id: dto.target_user_id,
                swiped_id: swiperId,
                action: SwipeAction.LIKE,
            },
            select: { id: true },
        });

        if (!theyLikedMe) {
            return { matched: false, conversation_id: null };
        }

        // Ensure canonical pair order (smaller UUID first) for the UNIQUE constraint
        const [userA, userB] =
            swiperId < dto.target_user_id
                ? [swiperId, dto.target_user_id]
                : [dto.target_user_id, swiperId];

        // Idempotent: match may already exist if the row was somehow created twice
        const existing = await this.matchRepo.findOne({
            where: { user_a_id: userA, user_b_id: userB },
            select: { id: true, conversation_id: true },
        });
        if (existing) {
            return { matched: true, conversation_id: existing.conversation_id };
        }

        // Reuses an existing conversation (e.g. from a prior contact request or
        // admin chat) instead of creating a duplicate pair — conversations has
        // no unique constraint on (user_a_id, user_b_id) to catch that itself.
        const conversation = await this.conversationsService.getOrCreate(userA, userB);

        // Create Match
        const match = this.matchRepo.create({
            user_a_id: userA,
            user_b_id: userB,
            conversation_id: conversation.id,
        });
        await this.matchRepo.save(match);

        return { matched: true, conversation_id: conversation.id };
    }

    async resetSwipes(userId: string): Promise<void> {
        await this.dataSource.query(
            `DELETE FROM swipes WHERE swiper_id = $1`,
            [userId],
        );
    }

    private async enforceSwipeLimit(userId: string): Promise<void> {
        const isPremium = await this.subscriptionRepo.findOne({
            where: [
                { user_id: userId, status: 'active', expires_at: IsNull() },
                { user_id: userId, status: 'active', expires_at: MoreThan(new Date()) },
            ],
            select: { id: true },
        });
        if (isPremium) return;

        const result = await this.dataSource.query<{ count: string }[]>(
            `SELECT COUNT(*)::int AS count
             FROM swipes
             WHERE swiper_id = $1
               AND swiped_at > NOW() - INTERVAL '24 hours'`,
            [userId],
        );
        if (Number(result[0].count) >= FREE_SWIPE_LIMIT) {
            throw new ForbiddenException(
                `Swipe-Limit erreicht (${FREE_SWIPE_LIMIT} pro 24 Stunden). Upgrade auf Premium für unlimitierte Swipes.`,
            );
        }
    }
}
