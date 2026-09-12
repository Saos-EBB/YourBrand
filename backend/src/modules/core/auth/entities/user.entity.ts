import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// Mirrors the DB enum public.user_role (migrations/001_baseline.sql) — single
// source of truth for role values, referenced by admin/dto/update-user-role.dto.ts
// instead of a second, independently-drifting copy.
export enum UserRole {
    USER  = 'user',
    ADMIN = 'admin',
    ORG   = 'org',
    OWNER = 'owner',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 64, unique: true, nullable: true })
    email_search_hash!: string | null;

    @Column({ type: 'varchar', nullable: true })
    password_hash!: string | null;

    @Column({ type: 'varchar', nullable: true })
    google_id_hash!: string | null;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
    role!: UserRole;

    @Column({ type: 'boolean', default: false })
    is_verified!: boolean;

    @Column({ type: 'boolean', default: false })
    is_banned!: boolean;

    @Column({ type: 'text', nullable: true })
    ban_reason!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    ban_expires_at!: Date | null;

    @Column({ type: 'boolean', default: false })
    vulnerable_flag!: boolean;

    @Column({ type: 'boolean', default: false })
    enhanced_protection!: boolean;

    @CreateDateColumn()
    created_at!: Date;

    @Column({ type: 'timestamptz', nullable: true })
    last_login!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    deleted_at!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    pseudonymized_at!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    email_verified_at!: Date | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    email_verification_token!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    email_verification_expires_at!: Date | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    password_reset_token!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    password_reset_expires_at!: Date | null;

    @Column({ type: 'bytea', nullable: true })
    email!: Buffer | null;

    @Column({ type: 'timestamptz', nullable: true })
    last_gdpr_export_at!: Date | null;

    @Column({ type: 'varchar', length: 12, unique: true, nullable: true })
    public_id!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    exile_until!: Date | null;

}