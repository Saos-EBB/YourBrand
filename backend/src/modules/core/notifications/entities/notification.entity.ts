import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// Mirrors the DB enum public.notification_type (migrations/001_baseline.sql).
// The `type` column below is plain varchar (not `enum:`-typed) — only the DB
// enforces this list. Add a new type in both places, or notification writes
// will fail against the DB while TypeScript stays green.
export type NotificationType =
    'message' | 'match' | 'system' | 'ban' | 'request' |
    'beef_request' | 'beef_accepted' | 'beef_won' | 'beef_lost';

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    user_id!: string;

    @Column()
    type!: string;

    @Column({ nullable: true })
    content!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    title!: string | null;

    @Column({ type: 'text', nullable: true })
    related_id!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    content_vars!: Record<string, unknown> | null;

    @Column({ default: false })
    is_read!: boolean;

    @CreateDateColumn()
    created_at!: Date;
}
