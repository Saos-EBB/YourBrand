import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import leoProfanity from 'leo-profanity';
import { PROFANITY_WORDLIST } from './profanity.wordlist';

@Injectable()
export class ProfanityService implements OnModuleInit {
    private readonly logger = new Logger(ProfanityService.name);
    private customWords: string[] = [];

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly eventEmitter: EventEmitter2,
    ) {
        leoProfanity.add(PROFANITY_WORDLIST);
    }

    // Load custom DB words into leo-profanity on startup.
    // Wrapped in try/catch so a missing migration doesn't crash the server.
    async onModuleInit(): Promise<void> {
        try {
            const rows = await this.dataSource.query<{ word: string }[]>(
                'SELECT word FROM profanity_words',
            );
            this.customWords = rows.map((r) => r.word);
            if (this.customWords.length > 0) {
                leoProfanity.add(this.customWords);
            }
        } catch {
            // profanity_words table may not exist yet — silently skip
        }
    }

    // Leet-speak map + collapse spaced-out single chars so "n 1 g g 3 r" is caught.
    private normalize(text: string): string {
        const leet: Record<string, string> = {
            '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
            '6': 'b', '7': 't', '8': 'b', '9': 'g',
            '@': 'a', '$': 's', '!': 'i',
        };
        let s = text.replace(/[013456789@$!]/g, (c) => leet[c] ?? c);
        // collapse sequences of single chars separated by spaces/dots/dashes: "n i g g e r" → "nigger"
        s = s.replace(/(?<!\S)\S(?:[.\-_* ]+\S){2,}(?!\S)/g, (m) => m.replace(/[.\-_* ]+/g, ''));
        return s;
    }

    check(text: string): boolean {
        return leoProfanity.check(text) || leoProfanity.check(this.normalize(text));
    }

    blur(text: string): string {
        return leoProfanity.clean(text);
    }

    // Merged list used by GET /moderation/wordlist (frontend initialisation).
    getFullWordList(): string[] {
        const custom = this.customWords.filter((w) => !PROFANITY_WORDLIST.includes(w));
        return [...PROFANITY_WORDLIST, ...custom];
    }

    async flagUser(userId: string, word: string, contextType: 'chat' | 'bio' | 'status_message'): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO profanity_flags (user_id, word, context_type) VALUES ($1, $2, $3)`,
            [userId, word, contextType],
        );

        const [{ count }] = await this.dataSource.query<[{ count: string }]>(
            `SELECT COUNT(*) AS count FROM profanity_flags WHERE user_id = $1 AND flagged_at > NOW() - INTERVAL '24 hours'`,
            [userId],
        );

        if (parseInt(count, 10) >= 50) {
            this.logger.warn(`High profanity flag count for user ${userId}: ${count} flags in 24 h`);
        }
    }

    async createNicknameTicket(userId: string, nickname: string): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO admin_tickets (type, user_id, context) VALUES ('nickname', $1, $2)`,
            [userId, JSON.stringify({ nickname })],
        );
        this.eventEmitter.emit('ticket.new', {});
    }

    // ── Admin word management ──────────────────────────────────────────────────

    async getCustomWords(): Promise<{ word: string; added_by: string | null; added_at: Date }[]> {
        return this.dataSource.query(
            'SELECT word, added_by, added_at FROM profanity_words ORDER BY added_at DESC',
        );
    }

    async addCustomWord(word: string, adminId: string): Promise<void> {
        const normalised = word.toLowerCase().trim();
        if (PROFANITY_WORDLIST.includes(normalised)) {
            throw new BadRequestException('Wort ist bereits in der statischen Liste enthalten');
        }
        await this.dataSource.query(
            `INSERT INTO profanity_words (word, added_by) VALUES ($1, $2) ON CONFLICT (word) DO NOTHING`,
            [normalised, adminId],
        );
        if (!this.customWords.includes(normalised)) {
            this.customWords.push(normalised);
            leoProfanity.add([normalised]);
        }
    }

    async removeCustomWord(word: string): Promise<void> {
        const normalised = word.toLowerCase().trim();
        if (PROFANITY_WORDLIST.includes(normalised)) {
            throw new BadRequestException('Statische Wörter können nicht über die API entfernt werden');
        }
        const result = await this.dataSource.query(
            'DELETE FROM profanity_words WHERE word = $1 RETURNING word',
            [normalised],
        );
        if (!result.length) throw new NotFoundException('Wort nicht gefunden');
        this.customWords = this.customWords.filter((w) => w !== normalised);
        leoProfanity.remove([normalised]);
    }
}
