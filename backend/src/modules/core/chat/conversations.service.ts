import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';

@Injectable()
export class ConversationsService {
    constructor(
        @InjectRepository(Conversation)
        private readonly conversationRepo: Repository<Conversation>,
    ) { }

    // Single source of truth for "these two users need a conversation" — contact-request
    // acceptance, swipe matches and admin direct chats each used to run their own,
    // slightly different existence check (see docs/audit.html, Fund "Konkurrierendes
    // Datenmodell"). user_a_id/user_b_id order doesn't matter here:
    // trg_conversations_sort_users normalizes it on INSERT.
    async getOrCreate(
        userIdA: string,
        userIdB: string,
        opts: { contactRequestId?: string } = {},
    ): Promise<Conversation> {
        const existing = await this.conversationRepo
            .createQueryBuilder('c')
            .where(
                '(c.user_a_id = :a AND c.user_b_id = :b) OR (c.user_a_id = :b AND c.user_b_id = :a)',
                { a: userIdA, b: userIdB },
            )
            .getOne();

        if (existing) {
            // Reviving a soft- or fully-deleted conversation reuses the same row
            // (and its history) instead of creating a duplicate pair — this
            // matches chat.service.ts's pre-refactor behavior on request accept.
            existing.deleted_at_a = null;
            existing.deleted_at_b = null;
            existing.purged_at = null;
            if (opts.contactRequestId) existing.contact_request_id = opts.contactRequestId;
            return this.conversationRepo.save(existing);
        }

        const conversation = this.conversationRepo.create({
            user_a_id: userIdA,
            user_b_id: userIdB,
            contact_request_id: opts.contactRequestId ?? null,
        });
        return this.conversationRepo.save(conversation);
    }
}
