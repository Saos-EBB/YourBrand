import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface MatchListItem {
    match_id: string;
    conversation_id: string | null;
    matched_at: string;
    nickname: string;
    age: number | null;
    city: string | null;
    photo_url: string | null;
}

export interface DeckCandidate {
    user_id: string;
    nickname: string;
    photo_url: string | null;
    city: string | null;
    age: number;
    gender: string | null;
    looking_for: string | null;
    bio: string | null;
    distance_km: number | null;
    match_score: number;
    interests: { name_de: string; name_en: string | null; is_green: boolean }[];
}

@Injectable()
export class MatchingService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    // Deck-Groesse bewusst klein (6, nicht 20): das Discover-Grid rendert alle
    // Kandidaten gleichzeitig, jeder mit eigenem Foto-Request durch den
    // ngrok-Tunnel. Live gemessen (30 gleichzeitige Requests -> nur 9 von 30
    // kamen durch), das Free-Tier vertraegt keine 15-20 Bilder auf einmal.
    async buildDeck(viewerUserId: string): Promise<DeckCandidate[]> {
        // Fetch viewer's location and search radius in a single query.
        // location is select:false in the entity, so we use raw SQL.
        const viewerRows = await this.dataSource.query<
            { location: string | null; search_radius_km: number }[]
        >(
            `SELECT location::text, search_radius_km FROM profiles WHERE user_id = $1 LIMIT 1`,
            [viewerUserId],
        );

        if (!viewerRows.length || !viewerRows[0].location) {
            // No location set — return unscored deck without distance filter
            return this.buildDeckWithoutLocation(viewerUserId);
        }

        const radiusMeters = viewerRows[0].search_radius_km * 1000;

        const rows = await this.dataSource.query<any[]>(
            `
            WITH my_interests AS (
                SELECT interest_id, is_green
                FROM user_interests
                WHERE user_id = $1
            ),
            viewer_location AS (
                SELECT location FROM profiles WHERE user_id = $1
            ),
            candidates AS (
                SELECT
                    p.user_id,
                    p.nickname,
                    p.city,
                    p.bio,
                    p.gender,
                    p.looking_for,
                    DATE_PART('year', AGE(p.birthdate::date)) AS age,
                    CASE
                        WHEN p.location IS NOT NULL THEN
                            ROUND(
                                ST_Distance(
                                    (SELECT location FROM viewer_location)::geography,
                                    p.location::geography
                                ) / 1000
                            )::int
                        ELSE NULL
                    END AS distance_km,
                    mu.file_url AS photo_url
                FROM profiles p
                JOIN users u ON u.id = p.user_id
                    AND u.is_banned = false
                    AND u.deleted_at IS NULL
                LEFT JOIN media_uploads mu
                    ON mu.id = p.photo_id AND mu.moderation_status = 'approved'
                WHERE p.user_id <> $1
                  AND p.is_published = true
                  AND (
                      p.location IS NULL
                      OR ST_DWithin(
                          (SELECT location FROM viewer_location)::geography,
                          p.location::geography,
                          $2
                      )
                  )
                  -- exclude already-swiped: likes are permanent, skips expire after 30 days
                  AND NOT EXISTS (
                      SELECT 1 FROM swipes s
                      WHERE s.swiper_id = $1
                        AND s.swiped_id = p.user_id
                        AND (
                            s.action = 'like'
                            OR (s.action = 'skip' AND s.swiped_at > NOW() - INTERVAL '30 days')
                        )
                  )
            ),
            interest_scores AS (
                SELECT
                    ui.user_id,
                    SUM(
                        CASE
                            WHEN ui.is_green = mi.is_green THEN 2   -- shared Green or shared Red
                            ELSE -1                                  -- clash (one Green, one Red)
                        END
                    )::int AS interest_score
                FROM user_interests ui
                JOIN my_interests mi ON mi.interest_id = ui.interest_id
                GROUP BY ui.user_id
            )
            SELECT
                c.*,
                COALESCE(iss.interest_score, 0) +
                CASE
                    WHEN c.distance_km IS NOT NULL THEN GREATEST(0, 10 - c.distance_km::float / 10)
                    ELSE 0
                END AS match_score
            FROM candidates c
            LEFT JOIN interest_scores iss ON iss.user_id = c.user_id
            ORDER BY match_score DESC
            LIMIT 6
            `,
            [viewerUserId, radiusMeters],
        );

        return this.attachInterests(rows, viewerUserId);
    }

    async getMatches(userId: string): Promise<MatchListItem[]> {
        const rows = await this.dataSource.query<any[]>(
            `
            SELECT
                m.id            AS match_id,
                m.conversation_id,
                m.created_at    AS matched_at,
                p.nickname,
                DATE_PART('year', AGE(p.birthdate::date))::int AS age,
                p.city,
                mu.file_url     AS photo_url
            FROM matches m
            JOIN profiles p
                ON p.user_id = CASE
                    WHEN m.user_a_id = $1 THEN m.user_b_id
                    ELSE m.user_a_id
                END
            JOIN users u ON u.id = p.user_id
                AND u.is_banned = false
                AND u.deleted_at IS NULL
            LEFT JOIN media_uploads mu
                ON mu.id = p.photo_id AND mu.moderation_status = 'approved'
            WHERE (m.user_a_id = $1 OR m.user_b_id = $1)
            ORDER BY m.created_at DESC
            `,
            [userId],
        );

        return rows.map(r => ({
            match_id: r.match_id,
            conversation_id: r.conversation_id ?? null,
            matched_at: r.matched_at instanceof Date
                ? r.matched_at.toISOString()
                : String(r.matched_at),
            nickname: r.nickname,
            age: r.age != null ? Number(r.age) : null,
            city: r.city ?? null,
            photo_url: r.photo_url ?? null,
        }));
    }

    private async buildDeckWithoutLocation(viewerUserId: string): Promise<DeckCandidate[]> {
        const rows = await this.dataSource.query<any[]>(
            `
            WITH my_interests AS (
                SELECT interest_id, is_green
                FROM user_interests
                WHERE user_id = $1
            ),
            candidates AS (
                SELECT
                    p.user_id,
                    p.nickname,
                    p.city,
                    p.bio,
                    p.gender,
                    p.looking_for,
                    DATE_PART('year', AGE(p.birthdate::date)) AS age,
                    NULL::int AS distance_km,
                    mu.file_url AS photo_url
                FROM profiles p
                JOIN users u ON u.id = p.user_id
                    AND u.is_banned = false
                    AND u.deleted_at IS NULL
                LEFT JOIN media_uploads mu
                    ON mu.id = p.photo_id AND mu.moderation_status = 'approved'
                WHERE p.user_id <> $1
                  AND p.is_published = true
                  AND NOT EXISTS (
                      SELECT 1 FROM swipes s
                      WHERE s.swiper_id = $1
                        AND s.swiped_id = p.user_id
                        AND (
                            s.action = 'like'
                            OR (s.action = 'skip' AND s.swiped_at > NOW() - INTERVAL '30 days')
                        )
                  )
            ),
            interest_scores AS (
                SELECT
                    ui.user_id,
                    SUM(
                        CASE
                            WHEN ui.is_green = mi.is_green THEN 2
                            ELSE -1
                        END
                    )::int AS interest_score
                FROM user_interests ui
                JOIN my_interests mi ON mi.interest_id = ui.interest_id
                GROUP BY ui.user_id
            )
            SELECT
                c.*,
                COALESCE(iss.interest_score, 0) AS match_score
            FROM candidates c
            LEFT JOIN interest_scores iss ON iss.user_id = c.user_id
            ORDER BY match_score DESC
            LIMIT 6
            `,
            [viewerUserId],
        );

        return this.attachInterests(rows, viewerUserId);
    }

    private async attachInterests(rows: any[], viewerUserId: string): Promise<DeckCandidate[]> {
        if (!rows.length) return [];

        const userIds = rows.map(r => r.user_id);
        const interests = await this.dataSource.query<
            { user_id: string; name_de: string; name_en: string | null; is_green: boolean }[]
        >(
            `SELECT ui.user_id, i.name_de, i.name_en, ui.is_green
             FROM user_interests ui
             JOIN interests i ON i.id = ui.interest_id
             WHERE ui.user_id = ANY($1::uuid[])`,
            [userIds],
        );

        const byUser = new Map<string, typeof interests>();
        for (const row of interests) {
            if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
            byUser.get(row.user_id)!.push(row);
        }

        return rows.map(r => ({
            user_id: r.user_id,
            nickname: r.nickname,
            photo_url: r.photo_url ?? null,
            city: r.city ?? null,
            age: Number(r.age),
            gender: r.gender ?? null,
            looking_for: r.looking_for ?? null,
            bio: r.bio ?? null,
            distance_km: r.distance_km != null ? Number(r.distance_km) : null,
            match_score: Number(r.match_score),
            interests: (byUser.get(r.user_id) ?? []).map(i => ({
                name_de: i.name_de,
                name_en: i.name_en,
                is_green: i.is_green,
            })),
        }));
    }
}
