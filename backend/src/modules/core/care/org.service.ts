import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CareService } from './care.service';
import { AddMemberDto, CreateOrgDto } from './care.dto';

// Organisation (Modul "orgs"): ein Traeger mit Team. Teammitglieder sind
// Betreuer (managed_accounts.caretaker_id), ihre Betreuungen tragen die
// org_id. Die Organisation sieht alle diese Betreuungen auf einen Blick.
@Injectable()
export class OrgService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly care: CareService,
    ) { }

    async mine(userId: string) {
        return this.dataSource.query(
            `SELECT o.id, o.name, o.description, o.is_verified, om.role,
                    (SELECT count(*)::int FROM org_members x WHERE x.org_id = o.id AND x.left_at IS NULL) AS members,
                    (SELECT count(*)::int FROM managed_accounts ma WHERE ma.org_id = o.id AND ma.revoked_at IS NULL) AS clients
               FROM org_members om JOIN organizations o ON o.id = om.org_id AND o.deleted_at IS NULL
              WHERE om.user_id = $1 AND om.left_at IS NULL
              ORDER BY o.name`,
            [userId],
        );
    }

    // Plattform-Admin/Owner legt Organisationen an und wird deren Admin
    async create(userId: string, role: string, dto: CreateOrgDto) {
        if (role !== 'admin' && role !== 'owner') {
            throw new ForbiddenException('Organisationen legt die Plattform an');
        }
        return this.dataSource.transaction(async (m) => {
            const [org] = await m.query(
                `INSERT INTO organizations (owner_user_id, name, description, is_verified) VALUES ($1, $2, $3, true) RETURNING id`,
                [userId, dto.name.trim(), dto.description?.trim() || null],
            );
            await m.query(
                `INSERT INTO org_members (org_id, user_id, role, is_verified) VALUES ($1, $2, 'admin', true)`,
                [org.id, userId],
            );
            return { id: org.id };
        });
    }

    async overview(userId: string, orgId: string) {
        await this.care.requireOrgMember(userId, orgId);
        const [org] = await this.dataSource.query(
            'SELECT id, name, description, is_verified FROM organizations WHERE id = $1',
            [orgId],
        );
        const [members, clients] = await Promise.all([
            this.dataSource.query(
                `SELECT om.user_id, p.nickname, om.role, om.joined_at,
                        (SELECT count(*)::int FROM managed_accounts ma WHERE ma.caretaker_id = om.user_id
                          AND ma.org_id = om.org_id AND ma.revoked_at IS NULL) AS clients
                   FROM org_members om JOIN profiles p ON p.user_id = om.user_id
                  WHERE om.org_id = $1 AND om.left_at IS NULL
                  ORDER BY om.role, p.nickname`,
                [orgId],
            ),
            this.dataSource.query(
                `SELECT ma.id, ma.user_id, cp.nickname, tp.nickname AS caretaker_nickname,
                        ma.can_read_chat, ma.can_set_protection, ma.accepted_at, ma.expires_at,
                        u.vulnerable_flag,
                        (SELECT count(*)::int FROM contact_requests cr WHERE cr.receiver_id = ma.user_id
                          AND cr.status = 'pending' AND cr.caretaker_status = 'pending') AS pending_approvals,
                        (SELECT count(*)::int FROM reports r WHERE r.reporter_id = ma.user_id
                          AND r.status = 'open' AND r.deleted_at IS NULL) AS open_reports
                   FROM managed_accounts ma
                   JOIN profiles cp ON cp.user_id = ma.user_id
                   JOIN profiles tp ON tp.user_id = ma.caretaker_id
                   JOIN users u ON u.id = ma.user_id AND u.deleted_at IS NULL
                  WHERE ma.org_id = $1 AND ma.revoked_at IS NULL
                  ORDER BY cp.nickname`,
                [orgId],
            ),
        ]);
        return { ...org, members, clients };
    }

    async addMember(userId: string, orgId: string, dto: AddMemberDto) {
        await this.care.requireOrgMember(userId, orgId, 'admin');
        const [target] = await this.dataSource.query(
            `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
              WHERE lower(p.nickname) = lower($1) AND u.deleted_at IS NULL`,
            [dto.nickname],
        );
        if (!target) throw new NotFoundException('Niemand mit diesem Namen gefunden');
        const [existing] = await this.dataSource.query(
            'SELECT left_at FROM org_members WHERE org_id = $1 AND user_id = $2',
            [orgId, target.user_id],
        );
        if (existing && !existing.left_at) throw new ConflictException('Ist schon im Team');
        if (existing) {
            await this.dataSource.query(
                `UPDATE org_members SET left_at = NULL, joined_at = now(), role = $3 WHERE org_id = $1 AND user_id = $2`,
                [orgId, target.user_id, dto.role ?? 'member'],
            );
        } else {
            await this.dataSource.query(
                `INSERT INTO org_members (org_id, user_id, role, is_verified) VALUES ($1, $2, $3, true)`,
                [orgId, target.user_id, dto.role ?? 'member'],
            );
        }
        return { ok: true };
    }

    async removeMember(userId: string, orgId: string, memberId: string) {
        await this.care.requireOrgMember(userId, orgId, 'admin');
        if (memberId === userId) throw new ConflictException('Du kannst dich nicht selbst entfernen');
        await this.dataSource.query(
            'UPDATE org_members SET left_at = now() WHERE org_id = $1 AND user_id = $2 AND left_at IS NULL',
            [orgId, memberId],
        );
        return { ok: true };
    }
}
