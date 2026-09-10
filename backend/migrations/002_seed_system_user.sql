-- 002_seed_system_user.sql
-- The schema already assumes a "system" pseudo-user exists at this fixed
-- UUID (pseudonymize_user() excludes it, several views filter it out,
-- vulnerable_flag_audit.user_id defaults to it), but no migration or seed
-- ever actually inserted the row. strikes.issued_by has an FK to users, so
-- ModerationService's auto-suspend (issued_by = this UUID) has been failing
-- with a foreign-key violation since it was introduced — silently, because
-- the caller swallowed the error into a logger.error() call.
--
-- email_search_hash is a placeholder (not a real hash of anything) — this
-- row can't log in (no password_hash), it exists only to satisfy the FK.
-- 64 hex chars to satisfy chk_users_email_hash_length.
INSERT INTO users (id, email_search_hash, role, is_verified)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    '0000000000000000000000000000000000000000000000000000000000000000',
    'user',
    true
)
ON CONFLICT (id) DO NOTHING;
