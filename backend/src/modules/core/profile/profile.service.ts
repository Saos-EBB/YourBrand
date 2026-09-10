import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { uploadObject } from '../../../common/storage/object-storage.helper';
import { MediaUpload, FileType, FileContext, ModerationStatus } from '../media/entities/media-upload.entity';
import { withRls } from '../../../common/database/rls.helper';
import * as crypto from 'crypto';
import { Profile } from './entities/profile.entity';
import { User } from '../auth/entities/user.entity';
import { Interest } from './entities/interest.entity';
import { UserInterest } from './entities/user-interest.entity';
import { AgbVersion } from './entities/agb-version.entity';
import { ConsentLog } from './entities/consent-log.entity';
import { ProfileSensitiveData } from './entities/profile-sensitive-data.entity';
import { Block } from './entities/block.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SubmitSensitiveDataDto } from './dto/submit-sensitive-data.dto';
import { ProfanityService } from '../moderation/profanity.service';
import { encryptField } from '../../../common/crypto/crypto.helper';
import { ProfileView, PublicProfile, ConnectionStatus } from './profile.types';

@Injectable()
export class ProfileService {
    constructor(
        @InjectRepository(Profile)
        private readonly profileRepo: Repository<Profile>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Interest)
        private readonly interestRepo: Repository<Interest>,
        @InjectRepository(UserInterest)
        private readonly userInterestRepo: Repository<UserInterest>,
        @InjectRepository(AgbVersion)
        private readonly agbVersionRepo: Repository<AgbVersion>,
        @InjectRepository(ConsentLog)
        private readonly consentLogRepo: Repository<ConsentLog>,
        @InjectRepository(ProfileSensitiveData)
        private readonly sensitiveDataRepo: Repository<ProfileSensitiveData>,
        @InjectRepository(Block)
        private readonly blockRepo: Repository<Block>,
        @InjectRepository(MediaUpload)
        private readonly mediaUploadRepo: Repository<MediaUpload>,
        private readonly profanityService: ProfanityService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) { }

    async getOwnProfile(userId: string): Promise<Profile> {
        const profile = await this.profileRepo
            .createQueryBuilder('p')
            .innerJoin('p.user', 'u')
            .where('p.user_id = :userId', { userId })
            .andWhere('u.deleted_at IS NULL')
            .getOne();

        if (!profile) throw new NotFoundException('Profil nicht gefunden');
        return profile;
    }

    async getOwnProfileWithPhoto(userId: string): Promise<ProfileView> {
        const profile = await this.getOwnProfile(userId);

        let photoUrl: string | null = null;
        let photoNeedsReview = false;
        if (profile.photo_id) {
            const rows = await this.profileRepo.manager.query<{ file_url: string; needs_review: boolean }[]>(
                'SELECT file_url, needs_review FROM media_uploads WHERE id = $1',
                [profile.photo_id],
            );
            photoUrl = rows[0]?.file_url ?? null;
            photoNeedsReview = rows[0]?.needs_review ?? false;
        }

        let audioUrl: string | null = null;
        let audioModerationStatus: string | null = null;
        if (profile.audio_id) {
            const rows = await this.profileRepo.manager.query<{ file_url: string; moderation_status: string }[]>(
                'SELECT file_url, moderation_status FROM media_uploads WHERE id = $1',
                [profile.audio_id],
            );
            audioUrl = rows[0]?.file_url ?? null;
            audioModerationStatus = rows[0]?.moderation_status ?? null;
        }

        const subRows = await this.profileRepo.manager.query<{ plan: string; status: string; expires_at: Date | null }[]>(
            `SELECT plan, status, expires_at FROM subscriptions
             WHERE user_id = $1 AND status IN ('active')
             ORDER BY started_at DESC LIMIT 1`,
            [userId],
        );
        const sub = subRows[0] ?? null;

        const userRows = await this.profileRepo.manager.query<{ is_banned: boolean; public_id: string | null }[]>(
            'SELECT is_banned, public_id FROM users WHERE id = $1',
            [userId],
        );

        return {
            id: profile.id,
            userId: profile.user_id,
            nickname: profile.nickname,
            bio: profile.bio,
            city: profile.city,
            birthdate: profile.birthdate,
            gender: profile.gender,
            lookingFor: profile.looking_for,
            isPublished: profile.is_published,
            onboardingCompleted: profile.onboarding_completed,
            langSimple: profile.lang_simple,
            fontSize: profile.font_size,
            highContrast: profile.high_contrast,
            searchRadiusKm: profile.search_radius_km,
            profanityFilter: profile.profanity_filter,
            statusVisible: profile.status_visible,
            statusMessage: profile.status_message,
            showBio: profile.show_bio,
            showCity: profile.show_city,
            showAge: profile.show_age,
            showGender: profile.show_gender,
            showInterests: profile.show_interests,
            showAudio: profile.show_audio,
            lastActiveAt: profile.last_active_at,
            updatedAt: profile.updated_at,
            photoUrl,
            photoNeedsReview,
            nicknameChangedAt: profile.nickname_changed_at ? new Date(profile.nickname_changed_at).toISOString() : null,
            genderChangedAt: profile.gender_changed_at ? new Date(profile.gender_changed_at).toISOString() : null,
            audioUrl,
            audioModerationStatus,
            subscriptionPlan: sub?.plan ?? null,
            subscriptionStatus: sub?.status ?? null,
            subscriptionCurrentPeriodEnd: sub?.expires_at ? new Date(sub.expires_at).toISOString() : null,
            isBanned: userRows[0]?.is_banned ?? false,
            publicId: userRows[0]?.public_id ?? null,
        };
    }

    async updateOwnProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
        const profile = await this.getOwnProfile(userId);

        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

        if (dto.nickname !== undefined) {
            dto.nickname = dto.nickname.toLowerCase().trim();

            if (dto.nickname !== profile.nickname) {
                if (profile.nickname_changed_at && profile.nickname_changed_at > oneYearAgo) {
                    throw new BadRequestException('Nickname kann nur einmal pro Jahr geändert werden');
                }
                if (!/^[a-z0-9_\-äöüß]{3,30}$/.test(dto.nickname)) {
                    throw new BadRequestException('Ungültiger Nickname');
                }
                const taken = await this.profileRepo.findOne({
                    where: { nickname: dto.nickname },
                });
                if (taken) throw new ConflictException('Nickname bereits vergeben');
                profile.nickname_changed_at = new Date();
                if (this.profanityService.check(dto.nickname)) {
                    this.profanityService.createNicknameTicket(userId, dto.nickname).catch(() => {});
                }
            }

            profile.nickname = dto.nickname;
        }
        if (dto.birthdate !== undefined) profile.birthdate = dto.birthdate;
        if (dto.bio !== undefined) {
            profile.bio = dto.bio;
            if (dto.bio && this.profanityService.check(dto.bio)) {
                this.profanityService.flagUser(userId, '', 'bio').catch(() => {});
            }
        }
        if (dto.city !== undefined) profile.city = dto.city;
        if (dto.lang_simple !== undefined) profile.lang_simple = dto.lang_simple;
        if (dto.font_size !== undefined) profile.font_size = dto.font_size;
        if (dto.high_contrast !== undefined) profile.high_contrast = dto.high_contrast;
        if (dto.search_radius_km !== undefined) profile.search_radius_km = dto.search_radius_km;
        if (dto.is_published !== undefined) {
            if (dto.is_published && !profile.onboarding_completed) {
                throw new BadRequestException('Onboarding nicht abgeschlossen');
            }
            profile.is_published = dto.is_published;
        }
        if (dto.gender !== undefined) {
            if (dto.gender !== profile.gender) {
                if (profile.gender_changed_at && profile.gender_changed_at > oneYearAgo) {
                    throw new BadRequestException('Geschlecht kann nur einmal pro Jahr geändert werden');
                }
                profile.gender_changed_at = new Date();
            }
            profile.gender = dto.gender;
        }
        if (dto.looking_for !== undefined) profile.looking_for = dto.looking_for;
        if (dto.profanity_filter !== undefined) profile.profanity_filter = dto.profanity_filter;
        if (dto.status_visible !== undefined) profile.status_visible = dto.status_visible;
        if (dto.show_bio !== undefined) profile.show_bio = dto.show_bio;
        if (dto.show_city !== undefined) profile.show_city = dto.show_city;
        if (dto.show_age !== undefined) profile.show_age = dto.show_age;
        if (dto.show_gender !== undefined) profile.show_gender = dto.show_gender;
        if (dto.show_interests !== undefined) profile.show_interests = dto.show_interests;
        if (dto.show_audio !== undefined) profile.show_audio = dto.show_audio;
        if (dto.status_message !== undefined) {
            profile.status_message = dto.status_message;
            if (dto.status_message && this.profanityService.check(dto.status_message)) {
                this.profanityService.flagUser(userId, '', 'status_message').catch(() => {});
            }
        }

        const saved = await this.profileRepo.save(profile);

        if (dto.lat != null && dto.lng != null) {
            await this.profileRepo.manager.query(
                `UPDATE profiles SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE user_id = $3`,
                [dto.lng, dto.lat, userId],
            );
        }

        await this.checkAndCompleteOnboarding(userId);
        return saved;
    }

    private async checkAndCompleteOnboarding(userId: string): Promise<void> {
        const profile = await this.profileRepo.findOne({
            where: { user_id: userId },
            select: ['id', 'nickname', 'birthdate', 'city', 'onboarding_completed'],
        });
        if (!profile || profile.onboarding_completed) return;

        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user?.is_verified) return;

        const [{ count }] = await this.profileRepo.manager.query<[{ count: string }]>(
            'SELECT COUNT(*) AS count FROM user_interests WHERE user_id = $1',
            [userId],
        );

        const interestCount = parseInt(count, 10);
        if (
            profile.nickname &&
            profile.birthdate &&
            profile.city &&
            interestCount >= 1
        ) {
            profile.onboarding_completed = true;
            await this.profileRepo.save(profile);
        }
    }

    async publishProfile(userId: string): Promise<Profile> {
        const profile = await this.getOwnProfile(userId);
        if (!profile.onboarding_completed) {
            throw new BadRequestException('Onboarding nicht abgeschlossen');
        }
        profile.is_published = true;
        return this.profileRepo.save(profile);
    }

    async getInterests(): Promise<Interest[]> {
        return this.interestRepo.find();
    }

    async getUserInterests(userId: string): Promise<UserInterest[]> {
        return this.userInterestRepo.find({
            where: { user_id: userId },
            relations: ['interest'],
        });
    }

    async addInterest(userId: string, interestId: string): Promise<UserInterest[]> {
        const interest = await this.interestRepo.findOne({ where: { id: interestId } });
        if (!interest) throw new NotFoundException('Interesse nicht gefunden');

        const existing = await this.userInterestRepo.findOne({
            where: { user_id: userId, interest_id: interestId },
        });
        if (!existing) {
            const entry = this.userInterestRepo.create({ user_id: userId, interest_id: interestId });
            await this.userInterestRepo.save(entry);
        }

        await this.checkAndCompleteOnboarding(userId);
        return this.getUserInterests(userId);
    }

    async updateInterestFlag(userId: string, interestId: string, isGreen: boolean): Promise<UserInterest[]> {
        await this.userInterestRepo.update(
            { user_id: userId, interest_id: interestId },
            { is_green: isGreen },
        );
        return this.getUserInterests(userId);
    }

    async removeInterest(userId: string, interestId: string): Promise<UserInterest[]> {
        await this.userInterestRepo.delete({ user_id: userId, interest_id: interestId });
        return this.getUserInterests(userId);
    }

    async getPublicProfile(nickname: string, viewerId: string | null = null): Promise<PublicProfile> {
        const profile = await this.profileRepo
            .createQueryBuilder('p')
            .innerJoin('p.user', 'u')
            .select([
                'p.id', 'p.user_id', 'p.nickname', 'p.bio', 'p.city', 'p.birthdate',
                'p.photo_id', 'p.audio_id', 'p.gender', 'p.looking_for',
                'p.last_active_at', 'p.status_visible', 'p.status_message',
                'p.show_bio', 'p.show_city', 'p.show_age', 'p.show_gender',
                'p.show_interests', 'p.show_audio',
            ])
            .where('p.nickname = :nickname', { nickname })
            .andWhere('p.is_published = true')
            .andWhere('u.deleted_at IS NULL')
            .getOne();

        if (!profile) throw new NotFoundException('Profil nicht gefunden');

        let photo_url: string | null = null;
        let photo_needs_review = false;
        if (profile.photo_id) {
            const rows = await this.profileRepo.manager.query<{ file_url: string; needs_review: boolean }[]>(
                'SELECT file_url, needs_review FROM media_uploads WHERE id = $1',
                [profile.photo_id],
            );
            photo_url = rows[0]?.file_url ?? null;
            photo_needs_review = rows[0]?.needs_review ?? false;
        }

        let audio_url: string | null = null;
        if (profile.show_audio && profile.audio_id) {
            const rows = await this.profileRepo.manager.query<{ file_url: string; moderation_status: string }[]>(
                'SELECT file_url, moderation_status FROM media_uploads WHERE id = $1',
                [profile.audio_id],
            );
            if (rows[0]?.moderation_status === ModerationStatus.APPROVED) {
                audio_url = rows[0].file_url;
            }
        }

        const onlineThreshold = new Date(Date.now() - 3 * 60 * 1000);
        const isOnline = profile.status_visible && profile.last_active_at !== null && profile.last_active_at > onlineThreshold;

        type ConnRow = { connection_status: string; conversation_id: string | null; request_id: string | null };
        let connectionStatus: ConnectionStatus = 'NONE';
        let requestId: string | null = null;
        let conversationId: string | null = null;

        if (viewerId && viewerId !== profile.user_id) {
            const rows = await this.profileRepo.manager.query<ConnRow[]>(
                `SELECT
                   CASE
                     WHEN EXISTS (
                       SELECT 1 FROM blocks b
                       WHERE b.blocker_id = $1 AND b.blocked_id = $2
                     ) THEN 'BLOCKED'
                     WHEN EXISTS (
                       SELECT 1 FROM conversations c
                       WHERE ((c.user_a_id = $1 AND c.user_b_id = $2)
                           OR (c.user_a_id = $2 AND c.user_b_id = $1))
                         AND c.purged_at IS NULL
                     ) THEN 'CONNECTED'
                     WHEN EXISTS (
                       SELECT 1 FROM contact_requests cr
                       WHERE cr.sender_id = $1 AND cr.receiver_id = $2 AND cr.status = 'pending'
                     ) THEN 'SENT'
                     WHEN EXISTS (
                       SELECT 1 FROM contact_requests cr
                       WHERE cr.sender_id = $2 AND cr.receiver_id = $1 AND cr.status = 'pending'
                     ) THEN 'RECEIVED'
                     ELSE 'NONE'
                   END AS connection_status,
                   (
                     SELECT c.id FROM conversations c
                     WHERE ((c.user_a_id = $1 AND c.user_b_id = $2)
                         OR (c.user_a_id = $2 AND c.user_b_id = $1))
                       AND c.purged_at IS NULL
                     LIMIT 1
                   ) AS conversation_id,
                   (
                     SELECT cr.id FROM contact_requests cr
                     WHERE cr.sender_id = $2 AND cr.receiver_id = $1 AND cr.status = 'pending'
                     LIMIT 1
                   ) AS request_id`,
                [viewerId, profile.user_id],
            );
            connectionStatus = (rows[0]?.connection_status ?? 'NONE') as ConnectionStatus;
            requestId = rows[0]?.request_id ?? null;
            conversationId = rows[0]?.conversation_id ?? null;
        }

        const [publicIdRow] = await this.profileRepo.manager.query<{ public_id: string | null }[]>(
            'SELECT public_id FROM users WHERE id = $1',
            [profile.user_id],
        );

        return {
            id: profile.id,
            userId: profile.user_id,
            nickname: profile.nickname,
            bio: profile.show_bio ? profile.bio : null,
            city: profile.show_city ? profile.city : null,
            birthdate: profile.show_age ? profile.birthdate : null,
            gender: profile.show_gender ? profile.gender : null,
            // looking_for is intentionally gated behind show_gender —
            // hiding gender also hides looking_for to prevent reverse inference.
            lookingFor: profile.show_gender ? profile.looking_for : null,
            statusVisible: profile.status_visible,
            statusMessage: profile.status_message,
            photoUrl: photo_url,
            photoNeedsReview: photo_needs_review,
            audioUrl: audio_url,
            isOnline,
            connectionStatus,
            requestId,
            conversationId,
            publicId: publicIdRow?.public_id ?? null,
        };
    }

    async getPublicProfileInterests(nickname: string): Promise<UserInterest[]> {
        const profile = await this.profileRepo
            .createQueryBuilder('p')
            .innerJoin('p.user', 'u')
            .select(['p.user_id', 'p.show_interests'])
            .where('p.nickname = :nickname', { nickname })
            .andWhere('p.is_published = true')
            .andWhere('u.deleted_at IS NULL')
            .getOne();

        if (!profile) throw new NotFoundException('Profil nicht gefunden');
        if (!profile.show_interests) return [];

        return this.userInterestRepo.find({
            where: { user_id: profile.user_id },
            relations: ['interest'],
        });
    }



    async getProfileByUserId(userId: string): Promise<{ nickname: string; photo_id: string | null; photo_url: string | null }> {
        const profile = await this.profileRepo
            .createQueryBuilder('p')
            .innerJoin('p.user', 'u')
            .select(['p.nickname', 'p.photo_id'])
            .where('p.user_id = :userId', { userId })
            .andWhere('u.deleted_at IS NULL')
            .getOne();

        if (!profile) throw new NotFoundException('Profil nicht gefunden');

        let photo_url: string | null = null;
        if (profile.photo_id) {
            const rows = await this.profileRepo.manager.query<{ file_url: string }[]>(
                'SELECT file_url FROM media_uploads WHERE id = $1',
                [profile.photo_id],
            );
            photo_url = rows[0]?.file_url ?? null;
        }

        return { nickname: profile.nickname, photo_id: profile.photo_id ?? null, photo_url };
    }

    async searchProfiles(
        requestingUserId: string,
        city?: string,
        interestIds?: string[],
        gender?: string,
        lookingFor?: string,
        minAge?: number,
        maxAge?: number,
        onlineOnly?: boolean,
        connectionStatus?: 'NONE' | 'SENT' | 'RECEIVED' | 'CONNECTED',
        lat?: number,
        lng?: number,
        radius?: number,
    ): Promise<(Partial<Profile> & { photo_url: string | null; photo_needs_review: boolean; is_online: boolean; interests: { id: string; name_de: string; category: string | null }[]; connection_status: 'NONE' | 'SENT' | 'RECEIVED' | 'CONNECTED'; conversation_id: string | null; request_id: string | null })[]> {
        const qb = this.profileRepo
            .createQueryBuilder('p')
            .innerJoin('p.user', 'u')
            .select([
                'p.id', 'p.user_id', 'p.nickname', 'p.bio', 'p.city', 'p.birthdate',
                'p.photo_id', 'p.gender', 'p.looking_for', 'p.last_active_at',
                'p.status_visible', 'p.status_message',
                'p.show_bio', 'p.show_city', 'p.show_age', 'p.show_gender',
                'p.show_interests', 'p.show_audio',
            ])
            .where('p.is_published = true')
            .andWhere('u.is_banned = false')
            .andWhere('u.deleted_at IS NULL')
            .andWhere('u.enhanced_protection = false')
            .andWhere('u.vulnerable_flag = false')
            .andWhere('p.user_id != :requestingUserId', { requestingUserId })
            .andWhere(`
            NOT EXISTS (
                SELECT 1 FROM blocks b
                WHERE (b.blocker_id = :requestingUserId AND b.blocked_id = p.user_id)
                   OR (b.blocker_id = p.user_id AND b.blocked_id = :requestingUserId)
            )
        `, { requestingUserId });

        if (lat != null && lng != null) {
            const radiusMeters = (radius ?? 50) * 1000;
            qb.andWhere(
                `ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radiusMeters)`,
                { lat, lng, radiusMeters },
            );
        } else if (city) {
            qb.andWhere('LOWER(p.city) LIKE LOWER(:city)', { city: `%${city}%` });
        }

        if (interestIds && interestIds.length > 0) {
            qb.andWhere(`
            EXISTS (
                SELECT 1 FROM user_interests ui
                WHERE ui.user_id = p.user_id
                  AND ui.interest_id = ANY(:interestIds)
            )
        `, { interestIds });
        }

        if (gender) {
            qb.andWhere('p.gender = :gender', { gender });
        }

        if (lookingFor) {
            qb.andWhere('p.looking_for = :lookingFor', { lookingFor });
        }

        if (minAge !== undefined) {
            qb.andWhere("EXTRACT(YEAR FROM AGE(p.birthdate::date)) >= :minAge", { minAge });
        }

        if (maxAge !== undefined) {
            qb.andWhere("EXTRACT(YEAR FROM AGE(p.birthdate::date)) <= :maxAge", { maxAge });
        }

        if (onlineOnly) {
            qb.andWhere("p.last_active_at > NOW() - INTERVAL '3 minutes'");
        }

        if (connectionStatus === 'CONNECTED') {
            qb.andWhere(`
                EXISTS (
                    SELECT 1 FROM conversations c
                    WHERE ((c.user_a_id = :requestingUserId AND c.user_b_id = p.user_id)
                        OR (c.user_a_id = p.user_id AND c.user_b_id = :requestingUserId))
                      AND c.purged_at IS NULL
                )
            `);
        } else if (connectionStatus === 'SENT') {
            qb.andWhere(`
                EXISTS (
                    SELECT 1 FROM contact_requests cr
                    WHERE cr.sender_id = :requestingUserId AND cr.receiver_id = p.user_id
                      AND cr.status = 'pending'
                )
            `);
        } else if (connectionStatus === 'RECEIVED') {
            qb.andWhere(`
                EXISTS (
                    SELECT 1 FROM contact_requests cr
                    WHERE cr.sender_id = p.user_id AND cr.receiver_id = :requestingUserId
                      AND cr.status = 'pending'
                )
            `);
        } else if (connectionStatus === 'NONE') {
            qb.andWhere(`
                NOT EXISTS (
                    SELECT 1 FROM conversations c
                    WHERE ((c.user_a_id = :requestingUserId AND c.user_b_id = p.user_id)
                        OR (c.user_a_id = p.user_id AND c.user_b_id = :requestingUserId))
                      AND c.purged_at IS NULL
                )
            `);
            qb.andWhere(`
                NOT EXISTS (
                    SELECT 1 FROM contact_requests cr
                    WHERE ((cr.sender_id = :requestingUserId AND cr.receiver_id = p.user_id)
                        OR (cr.sender_id = p.user_id AND cr.receiver_id = :requestingUserId))
                      AND cr.status = 'pending'
                )
            `);
        }

        const profiles = await qb.getMany();
        const onlineThreshold = new Date(Date.now() - 3 * 60 * 1000);

        const maskedProfiles = profiles.map(p => ({
            ...p,
            bio:         p.show_bio     ? p.bio         : null,
            city:        p.show_city    ? p.city         : null,
            birthdate:   p.show_age     ? p.birthdate    : (null as any),
            gender:      p.show_gender  ? p.gender       : null,
            // looking_for is intentionally gated behind show_gender —
            // hiding gender also hides looking_for to prevent reverse inference.
            looking_for: p.show_gender  ? p.looking_for  : null,
        }));

        const photoIds = maskedProfiles
            .map(p => p.photo_id)
            .filter((id): id is string => id !== null);

        const urlMap: Record<string, string> = {};
        const reviewMap: Record<string, boolean> = {};
        if (photoIds.length > 0) {
            const rows = await this.profileRepo.manager.query<{ id: string; file_url: string; needs_review: boolean }[]>(
                'SELECT id, file_url, needs_review FROM media_uploads WHERE id = ANY($1)',
                [photoIds],
            );
            for (const row of rows) {
                urlMap[row.id] = row.file_url;
                reviewMap[row.id] = row.needs_review;
            }
        }

        const userIds = maskedProfiles.map(p => p.user_id);

        type InterestRow = { user_id: string; id: string; name_de: string; category: string | null };
        const interestRows = userIds.length > 0
            ? await this.profileRepo.manager.query<InterestRow[]>(
                  `SELECT ui.user_id, i.id, i.name_de, i.category
                   FROM user_interests ui
                   JOIN interests i ON i.id = ui.interest_id
                   WHERE ui.user_id = ANY($1)`,
                  [userIds],
              )
            : [];

        const interestsMap: Record<string, { id: string; name_de: string; category: string | null }[]> = {};
        for (const row of interestRows) {
            (interestsMap[row.user_id] ??= []).push({ id: row.id, name_de: row.name_de, category: row.category });
        }

        type ConnectionRow = {
            user_id: string;
            connection_status: 'NONE' | 'SENT' | 'RECEIVED' | 'CONNECTED';
            conversation_id: string | null;
            request_id: string | null;
        };
        const connectionRows = userIds.length > 0
            ? await this.profileRepo.manager.query<ConnectionRow[]>(
                  `WITH u AS (SELECT unnest($1::uuid[]) AS uid)
                   SELECT
                     u.uid AS user_id,
                     CASE
                       WHEN EXISTS (
                         SELECT 1 FROM conversations c
                         WHERE ((c.user_a_id = $2 AND c.user_b_id = u.uid)
                             OR (c.user_a_id = u.uid AND c.user_b_id = $2))
                           AND c.purged_at IS NULL
                       ) THEN 'CONNECTED'
                       WHEN EXISTS (
                         SELECT 1 FROM contact_requests cr
                         WHERE cr.sender_id = $2 AND cr.receiver_id = u.uid AND cr.status = 'pending'
                       ) THEN 'SENT'
                       WHEN EXISTS (
                         SELECT 1 FROM contact_requests cr
                         WHERE cr.sender_id = u.uid AND cr.receiver_id = $2 AND cr.status = 'pending'
                       ) THEN 'RECEIVED'
                       ELSE 'NONE'
                     END AS connection_status,
                     (
                       SELECT c.id FROM conversations c
                       WHERE ((c.user_a_id = $2 AND c.user_b_id = u.uid)
                           OR (c.user_a_id = u.uid AND c.user_b_id = $2))
                         AND c.purged_at IS NULL
                       LIMIT 1
                     ) AS conversation_id,
                     (
                       SELECT cr.id FROM contact_requests cr
                       WHERE cr.sender_id = u.uid AND cr.receiver_id = $2 AND cr.status = 'pending'
                       LIMIT 1
                     ) AS request_id
                   FROM u`,
                  [userIds, requestingUserId],
              )
            : [];

        const connectionMap: Record<string, ConnectionRow> = {};
        for (const row of connectionRows) {
            connectionMap[row.user_id] = row;
        }

        return maskedProfiles.map(p => ({
            ...p,
            photo_url: p.photo_id ? (urlMap[p.photo_id] ?? null) : null,
            photo_needs_review: p.photo_id ? (reviewMap[p.photo_id] ?? false) : false,
            is_online: p.status_visible && p.last_active_at !== null && p.last_active_at > onlineThreshold,
            interests: p.show_interests ? (interestsMap[p.user_id] ?? []) : [],
            connection_status: (connectionMap[p.user_id]?.connection_status ?? 'NONE') as 'NONE' | 'SENT' | 'RECEIVED' | 'CONNECTED',
            conversation_id: connectionMap[p.user_id]?.conversation_id ?? null,
            request_id: connectionMap[p.user_id]?.request_id ?? null,
        }));
    }



    async createSensitiveDataConsent(userId: string, ip: string): Promise<Partial<ConsentLog>> {
        const agbVersion = await this.agbVersionRepo.findOne({
            where: { type: 'sensitive_data' as any, is_current: true },
        });
        if (!agbVersion) throw new NotFoundException('Keine aktuelle AGB-Version gefunden');

        const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

        const entry = this.consentLogRepo.create({
            user_id: userId,
            agb_version_id: agbVersion.id,
            accepted: true,
            accepted_at: new Date(),
            ip_hash: ipHash,
        });
        const saved = await this.consentLogRepo.save(entry);

        return { id: saved.id, accepted_at: saved.accepted_at, agb_version_id: saved.agb_version_id };
    }

    async submitSensitiveData(
        userId: string,
        dto: SubmitSensitiveDataDto,
    ): Promise<{ disability_visible: boolean; collected_at: Date }> {
        // consent_logs has no RLS — safe to query with the regular pool
        const consent = await this.consentLogRepo.findOne({
            where: { id: dto.consent_id },
        });
        if (!consent || consent.user_id !== userId || !consent.accepted) {
            throw new ForbiddenException('Ungültige oder fehlende Einwilligung');
        }

        const encryptedType = encryptField(dto.disability_type);
        const now = new Date();

        // profile_sensitive_data has FORCE ROW LEVEL SECURITY.
        // withRls pins a single connection, issues SET LOCAL app.current_user_id,
        // and runs all queries on that connection so the RLS policies see the
        // correct user context.
        return withRls(this.dataSource, userId, async (manager) => {
            const existing = await manager.findOne(ProfileSensitiveData, {
                where: { user_id: userId },
            });

            if (existing) {
                existing.consent_id       = dto.consent_id;
                existing.disability_type  = encryptedType;
                existing.disability_visible = dto.disability_visible;
                existing.updated_at       = now;
                await manager.save(ProfileSensitiveData, existing);
                return { disability_visible: existing.disability_visible, collected_at: existing.collected_at };
            }

            const entry = manager.create(ProfileSensitiveData, {
                user_id:            userId,
                consent_id:         dto.consent_id,
                disability_type:    encryptedType,
                disability_visible: dto.disability_visible,
                collected_at:       now,
                updated_at:         now,
            });
            const saved = await manager.save(ProfileSensitiveData, entry);
            return { disability_visible: saved.disability_visible, collected_at: saved.collected_at };
        });
    }


    async getBlocks(userId: string): Promise<{ block_id: string; user_id: string; nickname: string; photo_url: string | null }[]> {
        const blocks = await this.blockRepo.find({
            where: { blocker_id: userId },
            order: { created_at: 'DESC' },
        });

        if (blocks.length === 0) return [];

        const blockedUserIds = blocks.map(b => b.blocked_id);

        const profiles = await this.profileRepo
            .createQueryBuilder('p')
            .select(['p.user_id', 'p.nickname', 'p.photo_id'])
            .where('p.user_id IN (:...blockedUserIds)', { blockedUserIds })
            .getMany();

        const profileMap = new Map(profiles.map(p => [p.user_id, p]));

        const photoIds = profiles.filter(p => p.photo_id).map(p => p.photo_id as string);
        const urlMap: Record<string, string> = {};
        if (photoIds.length > 0) {
            const rows = await this.profileRepo.manager.query<{ id: string; file_url: string }[]>(
                'SELECT id, file_url FROM media_uploads WHERE id = ANY($1)',
                [photoIds],
            );
            for (const row of rows) urlMap[row.id] = row.file_url;
        }

        return blocks.map(b => {
            const prof = profileMap.get(b.blocked_id);
            return {
                block_id: b.id,
                user_id: b.blocked_id,
                nickname: prof?.nickname ?? 'Unbekannt',
                photo_url: prof?.photo_id ? (urlMap[prof.photo_id] ?? null) : null,
            };
        });
    }

    async blockUser(blockerId: string, blockedId: string): Promise<void> {
        if (blockerId === blockedId) throw new BadRequestException('Du kannst dich nicht selbst blockieren');

        const existing = await this.blockRepo.findOne({ where: { blocker_id: blockerId, blocked_id: blockedId } });
        if (existing) throw new ConflictException('Nutzer bereits blockiert');

        await this.blockRepo.save(this.blockRepo.create({ blocker_id: blockerId, blocked_id: blockedId }));
    }

    async unblockUser(blockerId: string, blockedId: string): Promise<void> {
        const existing = await this.blockRepo.findOne({ where: { blocker_id: blockerId, blocked_id: blockedId } });
        if (!existing) throw new NotFoundException('Blockierung nicht gefunden');

        await this.blockRepo.delete({ id: existing.id });
    }

    async uploadProfileAudio(
        userId: string,
        file: Express.Multer.File,
    ): Promise<{ id: string; file_url: string; moderation_status: string }> {
        if (file.size > 5 * 1024 * 1024) {
            throw new BadRequestException('Datei zu groß. Maximal 5 MB erlaubt.');
        }

        const baseType = file.mimetype.split(';')[0].trim();
        const extMap: Record<string, string> = {
            'audio/mpeg': '.mp3',
            'audio/ogg': '.ogg',
            'audio/mp4': '.m4a',
            'audio/wav': '.wav',
            'audio/webm': '.webm',
        };
        const ext = extMap[baseType] ?? '.audio';
        const filename = `${userId}-${Date.now()}${ext}`;
        const fileUrl = await uploadObject(`audio/${filename}`, file.buffer, baseType);

        const profile = await this.getOwnProfile(userId);
        if (profile.audio_id) {
            await this.mediaUploadRepo.update(profile.audio_id, {
                moderation_status: ModerationStatus.REJECTED,
            });
        }

        const media = this.mediaUploadRepo.create({
            uploaded_by: userId,
            file_url: fileUrl,
            file_type: FileType.AUDIO,
            context: FileContext.PROFILE,
            moderation_status: ModerationStatus.PENDING,
            needs_review: true,
            is_encrypted: false,
            file_size_kb: Math.ceil(file.size / 1024),
            conversation_id: null,
            org_id: null,
            file_use_for: 'profile_audio',
        });
        const saved = await this.mediaUploadRepo.save(media);

        await this.profileRepo.update({ user_id: userId }, { audio_id: saved.id });

        return { id: saved.id, file_url: fileUrl, moderation_status: ModerationStatus.PENDING };
    }

    async deleteProfileAudio(userId: string): Promise<void> {
        const profile = await this.getOwnProfile(userId);
        if (!profile.audio_id) return;

        await this.mediaUploadRepo.update(profile.audio_id, {
            moderation_status: ModerationStatus.REJECTED,
        });
        await this.profileRepo.update({ user_id: userId }, { audio_id: null });
    }

}
