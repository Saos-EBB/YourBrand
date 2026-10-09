import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProfanityService } from '../moderation/profanity.service';
import { TypedEventBus, AppEvents } from '../../shared/events/app-events';
import { CreateBoardPostDto } from './dto/create-board-post.dto';
import { VISIBILITY_METERS } from './board.constants';
import type { BoardKind, BoardRange, BoardVisibility } from './board.constants';

export interface BoardPost {
    id: string;
    kind: BoardKind;
    title: string;
    body: string;
    street: string | null;
    visibility: BoardVisibility;
    expires_at: string;
    created_at: string;
    author: { id: string; nickname: string; photo_url: string | null };
    distance_m: number | null;
    tears: number;
    torn_by_me: boolean;
    mine: boolean;
}

// Sichtbarkeit in SQL: Radius des Aushangs als Meter, public = unbegrenzt
const POST_RADIUS_SQL = `CASE bp.visibility
    WHEN 'street' THEN ${VISIBILITY_METERS.street}
    WHEN 'r500'   THEN ${VISIBILITY_METERS.r500}
    WHEN 'r1000'  THEN ${VISIBILITY_METERS.r1000}
    WHEN 'kiez'   THEN ${VISIBILITY_METERS.kiez}
    ELSE NULL END`;

@Injectable()
export class BoardService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly profanity: ProfanityService,
        private readonly events: TypedEventBus,
    ) { }

    // Aushaenge, die ich sehen darf: meine eigenen, oeffentliche, und solche,
    // in deren Umkreis ich wohne. range begrenzt zusaetzlich die Entfernung.
    async list(userId: string, range: BoardRange, kind?: BoardKind): Promise<BoardPost[]> {
        const rangeMeters = range === 'all' ? null : VISIBILITY_METERS[range];
        const rows = await this.dataSource.query(
            `WITH me AS (SELECT location FROM profiles WHERE user_id = $1)
             SELECT bp.id, bp.kind, bp.title, bp.body, bp.street, bp.visibility, bp.expires_at, bp.created_at,
                    bp.author_id, p.nickname, m.file_url AS photo_url,
                    CASE WHEN bp.location IS NULL OR (SELECT location FROM me) IS NULL THEN NULL
                         ELSE round(ST_Distance(bp.location, (SELECT location FROM me)))::int END AS distance_m,
                    (SELECT count(*)::int FROM board_tears t WHERE t.post_id = bp.id) AS tears,
                    EXISTS (SELECT 1 FROM board_tears t WHERE t.post_id = bp.id AND t.user_id = $1) AS torn_by_me
               FROM board_posts bp
               JOIN profiles p ON p.user_id = bp.author_id
               JOIN users u ON u.id = bp.author_id AND u.deleted_at IS NULL AND u.is_banned = false
               LEFT JOIN media_uploads m ON m.id = p.photo_id AND m.needs_review = false
              WHERE bp.deleted_at IS NULL AND bp.expires_at > now()
                AND ($3::text IS NULL OR bp.kind = $3)
                AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = bp.author_id)
                                                         OR (b.blocker_id = bp.author_id AND b.blocked_id = $1))
                AND (
                    bp.author_id = $1
                    OR (
                        (bp.visibility = 'public' OR (
                            bp.location IS NOT NULL AND (SELECT location FROM me) IS NOT NULL
                            AND ST_DWithin(bp.location, (SELECT location FROM me), ${POST_RADIUS_SQL})
                        ))
                        AND ($2::int IS NULL OR (
                            bp.location IS NOT NULL AND (SELECT location FROM me) IS NOT NULL
                            AND ST_DWithin(bp.location, (SELECT location FROM me), $2::int)
                        ))
                    )
                )
              ORDER BY bp.created_at DESC
              LIMIT 100`,
            [userId, rangeMeters, kind ?? null],
        );
        return rows.map((r: Record<string, unknown>) => this.toPost(r, userId));
    }

    // Ohne Login: nur oeffentliche Aushaenge, ohne Entfernung und Autor-ID
    async listPublic(limit = 6): Promise<Omit<BoardPost, 'distance_m' | 'torn_by_me' | 'mine'>[]> {
        const rows = await this.dataSource.query(
            `SELECT bp.id, bp.kind, bp.title, bp.body, bp.street, bp.visibility, bp.expires_at, bp.created_at,
                    p.nickname,
                    (SELECT count(*)::int FROM board_tears t WHERE t.post_id = bp.id) AS tears
               FROM board_posts bp
               JOIN profiles p ON p.user_id = bp.author_id
               JOIN users u ON u.id = bp.author_id AND u.deleted_at IS NULL AND u.is_banned = false
              WHERE bp.deleted_at IS NULL AND bp.expires_at > now() AND bp.visibility = 'public'
              ORDER BY bp.created_at DESC
              LIMIT $1`,
            [Math.min(Math.max(limit, 1), 20)],
        );
        return rows.map((r: Record<string, any>) => ({
            id: r.id, kind: r.kind, title: r.title, body: r.body, street: r.street,
            visibility: r.visibility, expires_at: r.expires_at, created_at: r.created_at,
            author: { id: '', nickname: r.nickname, photo_url: null },
            tears: r.tears,
        }));
    }

    async get(userId: string, id: string): Promise<BoardPost> {
        const all = await this.list(userId, 'all');
        const post = all.find((p) => p.id === id);
        if (!post) throw new NotFoundException('Aushang nicht gefunden');
        return post;
    }

    async hasPublicConsent(userId: string): Promise<boolean> {
        const rows = await this.dataSource.query('SELECT 1 FROM board_public_consents WHERE user_id = $1', [userId]);
        return rows.length > 0;
    }

    async create(userId: string, dto: CreateBoardPostDto): Promise<BoardPost> {
        const [user] = await this.dataSource.query(
            `SELECT u.vulnerable_flag, p.location IS NOT NULL AS has_location
               FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
            [userId],
        );
        if (!user) throw new NotFoundException('Profil nicht gefunden');

        if (dto.visibility === 'public') {
            // Schutz-Markierung: nur im Umkreis, nie oeffentlich (Datenschutz 4.3)
            if (user.vulnerable_flag) {
                throw new ForbiddenException('Mit Schutz-Markierung sind nur Aushänge im Umkreis möglich');
            }
            if (!(await this.hasPublicConsent(userId))) {
                if (!dto.publicConsent) throw new BadRequestException('PUBLIC_CONSENT_REQUIRED');
                await this.dataSource.query(
                    'INSERT INTO board_public_consents (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
                    [userId],
                );
            }
        } else if (!user.has_location) {
            throw new BadRequestException('Für Aushänge im Umkreis braucht dein Profil einen Ort');
        }

        const title = dto.title.trim();
        const body = dto.body.trim();
        if (this.profanity.check(title) || this.profanity.check(body)) {
            throw new BadRequestException('Der Aushang enthält Wörter, die hier nicht erlaubt sind');
        }

        const [row] = await this.dataSource.query(
            `INSERT INTO board_posts (author_id, kind, title, body, street, visibility, location)
             SELECT $1, $2, $3, $4, $5, $6, p.location FROM profiles p WHERE p.user_id = $1
             RETURNING id`,
            [userId, dto.kind, title, body, dto.street?.trim() || null, dto.visibility],
        );
        return this.get(userId, row.id);
    }

    // Autor loescht selbst, Admin/Owner entfernt (Moderation)
    async remove(userId: string, role: string, id: string): Promise<void> {
        const [post] = await this.dataSource.query(
            'SELECT author_id FROM board_posts WHERE id = $1 AND deleted_at IS NULL',
            [id],
        );
        if (!post) throw new NotFoundException('Aushang nicht gefunden');
        const isMod = role === 'admin' || role === 'owner';
        if (post.author_id !== userId && !isMod) throw new ForbiddenException('Keine Berechtigung');
        await this.dataSource.query('UPDATE board_posts SET deleted_at = now() WHERE id = $1', [id]);
    }

    // Zettel abreissen = Kontaktanfrage an den Autor, einmal pro Aushang
    async tear(userId: string, id: string, message?: string): Promise<{ contactRequestId: string }> {
        const post = await this.get(userId, id);
        if (post.mine) throw new BadRequestException('Das ist dein eigener Aushang');
        if (post.torn_by_me) throw new ConflictException('Du hast schon einen Zettel abgerissen');

        const preview = (message?.trim() || `Zettel: ${post.title}`).slice(0, 300);
        if (this.profanity.check(preview)) {
            throw new BadRequestException('Die Nachricht enthält Wörter, die hier nicht erlaubt sind');
        }

        return this.dataSource.transaction(async (m) => {
            // Bestehende offene Anfrage wiederverwenden statt doppelt zu fragen
            const [open] = await m.query(
                `SELECT id FROM contact_requests WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'`,
                [userId, post.author.id],
            );
            const requestId: string = open?.id ?? (await m.query(
                `INSERT INTO contact_requests (sender_id, receiver_id, message_preview) VALUES ($1, $2, $3) RETURNING id`,
                [userId, post.author.id, preview],
            ))[0].id;
            await m.query(
                'INSERT INTO board_tears (post_id, user_id, contact_request_id) VALUES ($1, $2, $3)',
                [id, userId, requestId],
            );
            if (!open) {
                this.events.emit(AppEvents.contactRequest, { requestId, senderId: userId, receiverId: post.author.id });
            }
            return { contactRequestId: requestId };
        });
    }

    private toPost(r: Record<string, any>, userId: string): BoardPost {
        return {
            id: r.id,
            kind: r.kind,
            title: r.title,
            body: r.body,
            street: r.street,
            visibility: r.visibility,
            expires_at: r.expires_at,
            created_at: r.created_at,
            author: { id: r.author_id, nickname: r.nickname, photo_url: r.photo_url },
            distance_m: r.distance_m,
            tears: r.tears,
            torn_by_me: r.torn_by_me,
            mine: r.author_id === userId,
        };
    }
}
