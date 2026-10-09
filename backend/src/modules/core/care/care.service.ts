import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../chat/conversations.service';
import { InviteClientDto, UpdateRightsDto } from './care.dto';

// Aktive Betreuung: angenommen, nicht widerrufen, nicht abgelaufen
export const ACTIVE_CARE_SQL = `ma.accepted_at IS NOT NULL AND ma.revoked_at IS NULL
    AND (ma.expires_at IS NULL OR ma.expires_at > now())`;

// Betreuung (Modul "caretaker"): ein Konto verwaltet ein oder wenige andere,
// wie ein Eltern-Konto. Die betreute Person stimmt zu (accepted_at) und kann
// Rechte aendern oder die Betreuung beenden (revoked_at). Rechte:
//   can_read_chat       Nachrichten lesen (nur lesen, nie im Namen schreiben)
//   can_set_protection  Schutz einstellen (enhanced_protection) und — bei
//                       vulnerable_flag — neue Kontakte freigeben
@Injectable()
export class CareService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly notifications: NotificationsService,
        private readonly conversations: ConversationsService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    // ── Sicht der betreuten Person ─────────────────────────────────────────

    async myHelpers(userId: string) {
        return this.dataSource.query(
            `SELECT ma.id, ma.can_read_chat, ma.can_set_protection, ma.accepted_at, ma.expires_at, ma.created_at,
                    p.nickname AS caretaker_nickname, o.name AS org_name
               FROM managed_accounts ma
               JOIN profiles p ON p.user_id = ma.caretaker_id
               LEFT JOIN organizations o ON o.id = ma.org_id AND o.deleted_at IS NULL
              WHERE ma.user_id = $1 AND ma.revoked_at IS NULL
                AND (ma.expires_at IS NULL OR ma.expires_at > now())
              ORDER BY ma.accepted_at NULLS FIRST, ma.created_at DESC`,
            [userId],
        );
    }

    async acceptHelper(userId: string, id: string) {
        const row = await this.ownCare(userId, id);
        if (row.accepted_at) throw new ConflictException('Schon angenommen');
        await this.dataSource.query('UPDATE managed_accounts SET accepted_at = now() WHERE id = $1', [id]);
        const nickname = await this.nickname(userId);
        this.notify(row.caretaker_id, 'notifications.care_accepted', 'Betreuung angenommen', { nickname });
        return { ok: true };
    }

    async updateRights(userId: string, id: string, dto: UpdateRightsDto) {
        await this.ownCare(userId, id);
        await this.dataSource.query(
            `UPDATE managed_accounts
                SET can_read_chat = COALESCE($2, can_read_chat),
                    can_set_protection = COALESCE($3, can_set_protection)
              WHERE id = $1`,
            [id, dto.can_read_chat ?? null, dto.can_set_protection ?? null],
        );
        return { ok: true };
    }

    async revokeHelper(userId: string, id: string) {
        const row = await this.ownCare(userId, id);
        await this.dataSource.query('UPDATE managed_accounts SET revoked_at = now() WHERE id = $1', [id]);
        const nickname = await this.nickname(userId);
        this.notify(row.caretaker_id, 'notifications.care_revoked', 'Betreuung beendet', { nickname });
        return { ok: true };
    }

    // ── Sicht der Betreuung ────────────────────────────────────────────────

    async invite(caretakerId: string, dto: InviteClientDto) {
        const [client] = await this.dataSource.query(
            `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
              WHERE lower(p.nickname) = lower($1) AND u.deleted_at IS NULL`,
            [dto.nickname],
        );
        if (!client) throw new NotFoundException('Niemand mit diesem Namen gefunden');
        if (client.user_id === caretakerId) throw new BadRequestException('Du kannst dich nicht selbst betreuen');
        if (dto.org_id) await this.requireOrgMember(caretakerId, dto.org_id);
        if (dto.expires_at && new Date(dto.expires_at) <= new Date()) {
            throw new BadRequestException('Das Ablaufdatum liegt in der Vergangenheit');
        }

        // uq_managed_user_caretaker: eine Zeile pro Paar. Eine beendete
        // Betreuung wird als neue Einladung wiederbelebt.
        const [existing] = await this.dataSource.query(
            'SELECT id, revoked_at FROM managed_accounts WHERE user_id = $1 AND caretaker_id = $2',
            [client.user_id, caretakerId],
        );
        if (existing && !existing.revoked_at) throw new ConflictException('Diese Person betreust du schon');

        const params = [client.user_id, caretakerId, dto.can_read_chat, dto.can_set_protection, dto.expires_at ?? null, dto.org_id ?? null];
        if (existing) {
            await this.dataSource.query(
                `UPDATE managed_accounts
                    SET can_read_chat = $3, can_set_protection = $4, expires_at = $5, org_id = $6,
                        can_write_chat = false, accepted_at = NULL, revoked_at = NULL, created_at = now()
                  WHERE user_id = $1 AND caretaker_id = $2`,
                params,
            );
        } else {
            await this.dataSource.query(
                `INSERT INTO managed_accounts (user_id, caretaker_id, can_read_chat, can_write_chat, can_set_protection, expires_at, org_id)
                 VALUES ($1, $2, $3, false, $4, $5, $6)`,
                params,
            );
        }
        const nickname = await this.nickname(caretakerId);
        this.notify(client.user_id, 'notifications.care_invite', 'Betreuung', { nickname });
        return { ok: true };
    }

    async myClients(caretakerId: string) {
        return this.dataSource.query(
            `SELECT ma.id, ma.user_id, p.nickname, ma.can_read_chat, ma.can_set_protection,
                    ma.accepted_at, ma.expires_at, ma.org_id, o.name AS org_name,
                    u.vulnerable_flag, u.enhanced_protection,
                    (SELECT count(*)::int FROM contact_requests cr
                      WHERE cr.receiver_id = ma.user_id AND cr.status = 'pending' AND cr.caretaker_status = 'pending') AS pending_approvals,
                    (SELECT count(*)::int FROM reports r
                      WHERE r.reporter_id = ma.user_id AND r.status = 'open' AND r.deleted_at IS NULL) AS open_reports
               FROM managed_accounts ma
               JOIN profiles p ON p.user_id = ma.user_id
               JOIN users u ON u.id = ma.user_id AND u.deleted_at IS NULL
               LEFT JOIN organizations o ON o.id = ma.org_id
              WHERE ma.caretaker_id = $1 AND ma.revoked_at IS NULL
                AND (ma.expires_at IS NULL OR ma.expires_at > now())
              ORDER BY p.nickname`,
            [caretakerId],
        );
    }

    // Kontaktanfragen an betreute Personen, die auf Freigabe warten
    async approvals(caretakerId: string) {
        return this.dataSource.query(
            `SELECT cr.id, cr.message_preview, cr.created_at, cr.receiver_accepted_at,
                    rp.nickname AS client_nickname, sp.nickname AS sender_nickname, sp.city AS sender_city,
                    su.created_at AS sender_since,
                    (SELECT count(*)::int FROM reports r WHERE r.reported_user_id = cr.sender_id AND r.deleted_at IS NULL) AS sender_reports
               FROM contact_requests cr
               JOIN managed_accounts ma ON ma.user_id = cr.receiver_id AND ma.caretaker_id = $1
                AND ma.can_set_protection AND ${ACTIVE_CARE_SQL}
               JOIN profiles rp ON rp.user_id = cr.receiver_id
               JOIN profiles sp ON sp.user_id = cr.sender_id
               JOIN users su ON su.id = cr.sender_id
              WHERE cr.status = 'pending' AND cr.caretaker_status = 'pending'
              ORDER BY cr.receiver_accepted_at`,
            [caretakerId],
        );
    }

    async decide(caretakerId: string, requestId: string, approve: boolean) {
        const [req] = await this.dataSource.query(
            `SELECT cr.id, cr.sender_id, cr.receiver_id
               FROM contact_requests cr
               JOIN managed_accounts ma ON ma.user_id = cr.receiver_id AND ma.caretaker_id = $1
                AND ma.can_set_protection AND ${ACTIVE_CARE_SQL}
              WHERE cr.id = $2 AND cr.status = 'pending' AND cr.caretaker_status = 'pending'`,
            [caretakerId, requestId],
        );
        if (!req) throw new NotFoundException('Keine offene Freigabe');

        if (!approve) {
            await this.dataSource.query(
                `UPDATE contact_requests SET caretaker_status = 'declined', status = 'declined', responded_at = now() WHERE id = $1`,
                [requestId],
            );
            return { ok: true };
        }

        await this.dataSource.query(
            `UPDATE contact_requests SET caretaker_status = 'approved', status = 'accepted', responded_at = now() WHERE id = $1`,
            [requestId],
        );
        const conversation = await this.conversations.getOrCreate(req.sender_id, req.receiver_id, { contactRequestId: requestId });
        const nickname = await this.nickname(req.receiver_id);
        this.eventEmitter.emit('contact_request.accepted', {
            senderId: req.sender_id, conversationId: conversation.id, acceptedByNickname: nickname,
        });
        this.notifications.createNotification(
            req.sender_id, 'match', 'notifications.request_accepted', 'Kontaktanfrage angenommen', conversation.id, { nickname },
        ).catch(() => {});
        this.notify(req.receiver_id, 'notifications.care_contact_approved', 'Kontakt freigegeben', {
            nickname: await this.nickname(req.sender_id),
        });
        return { ok: true, conversationId: conversation.id };
    }

    async setProtection(caretakerId: string, clientId: string, on: boolean) {
        await this.requireRight(caretakerId, clientId, 'can_set_protection');
        await this.dataSource.query('UPDATE users SET enhanced_protection = $2 WHERE id = $1', [clientId, on]);
        return { ok: true };
    }

    async clientConversations(caretakerId: string, clientId: string) {
        await this.requireRight(caretakerId, clientId, 'can_read_chat');
        return this.dataSource.query(
            `SELECT c.id, c.last_message_at, p.nickname AS partner_nickname,
                    (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.is_deleted = false
                      ORDER BY m.sent_at DESC LIMIT 1) AS last_message
               FROM conversations c
               JOIN profiles p ON p.user_id = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
              WHERE (c.user_a_id = $1 AND c.deleted_at_a IS NULL) OR (c.user_b_id = $1 AND c.deleted_at_b IS NULL)
              ORDER BY c.last_message_at DESC NULLS LAST`,
            [clientId],
        );
    }

    // Nur lesen — markiert nichts als gelesen, schreibt nichts
    async clientMessages(caretakerId: string, clientId: string, conversationId: string) {
        await this.requireRight(caretakerId, clientId, 'can_read_chat');
        const [conv] = await this.dataSource.query(
            'SELECT id FROM conversations WHERE id = $1 AND (user_a_id = $2 OR user_b_id = $2)',
            [conversationId, clientId],
        );
        if (!conv) throw new NotFoundException('Unterhaltung nicht gefunden');
        return this.dataSource.query(
            `SELECT m.id, m.sender_id = $2 AS from_client, CASE WHEN m.is_deleted THEN NULL ELSE m.content END AS content,
                    m.type, m.sent_at
               FROM messages m WHERE m.conversation_id = $1 ORDER BY m.sent_at ASC LIMIT 500`,
            [conversationId, clientId],
        );
    }

    // ── Kontakt-Freigabe ───────────────────────────────────────────────────

    // ChatService.acceptRequest haelt die Anfrage an (siehe dort) und meldet
    // das hier — Event statt Import, weil CareModule ChatModule importiert.
    @OnEvent('care.approval_needed')
    async onApprovalNeeded(payload: { receiverId: string }) {
        const caretakers: { caretaker_id: string }[] = await this.dataSource.query(
            `SELECT ma.caretaker_id FROM managed_accounts ma
              WHERE ma.user_id = $1 AND ma.can_set_protection AND ${ACTIVE_CARE_SQL}`,
            [payload.receiverId],
        );
        const nickname = await this.nickname(payload.receiverId);
        for (const c of caretakers) {
            this.notify(c.caretaker_id, 'notifications.care_approval_needed', 'Freigabe', { nickname });
        }
    }

    // ── intern ─────────────────────────────────────────────────────────────

    private async ownCare(userId: string, id: string) {
        const [row] = await this.dataSource.query(
            'SELECT id, caretaker_id, accepted_at FROM managed_accounts WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
            [id, userId],
        );
        if (!row) throw new NotFoundException('Betreuung nicht gefunden');
        return row;
    }

    private async requireRight(caretakerId: string, clientId: string, right: 'can_read_chat' | 'can_set_protection') {
        const [row] = await this.dataSource.query(
            `SELECT ma.${right} AS allowed FROM managed_accounts ma
              WHERE ma.caretaker_id = $1 AND ma.user_id = $2 AND ${ACTIVE_CARE_SQL}`,
            [caretakerId, clientId],
        );
        if (!row) throw new NotFoundException('Keine aktive Betreuung');
        if (!row.allowed) throw new ForbiddenException('Dieses Recht hat die Person nicht erteilt');
    }

    async requireOrgMember(userId: string, orgId: string, role?: 'admin') {
        const [row] = await this.dataSource.query(
            `SELECT om.role FROM org_members om JOIN organizations o ON o.id = om.org_id AND o.deleted_at IS NULL
              WHERE om.org_id = $1 AND om.user_id = $2 AND om.left_at IS NULL`,
            [orgId, userId],
        );
        if (!row) throw new ForbiddenException('Du gehörst nicht zu dieser Organisation');
        if (role && row.role !== role) throw new ForbiddenException('Nur für Admins der Organisation');
    }

    private async nickname(userId: string): Promise<string> {
        const [row] = await this.dataSource.query('SELECT nickname FROM profiles WHERE user_id = $1', [userId]);
        return row?.nickname ?? '';
    }

    private notify(userId: string, content: string, title: string, vars: Record<string, unknown>) {
        this.notifications.createNotification(userId, 'system', content, title, undefined, vars).catch(() => {});
    }
}
