-- Migration 033: Split conversations.deleted_at into per-user columns
-- Entity expects deleted_at_a (user_a soft-delete) and deleted_at_b (user_b soft-delete).
-- Existing deleted_at value is migrated to deleted_at_a as best-effort fallback.

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS deleted_at_a TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS deleted_at_b TIMESTAMPTZ NULL;

-- Best-effort: treat old deleted_at as user_a's delete timestamp
UPDATE conversations SET deleted_at_a = deleted_at WHERE deleted_at IS NOT NULL;

ALTER TABLE conversations DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_conv_deleted;
CREATE INDEX idx_conv_deleted_a ON conversations(deleted_at_a) WHERE deleted_at_a IS NOT NULL;
CREATE INDEX idx_conv_deleted_b ON conversations(deleted_at_b) WHERE deleted_at_b IS NOT NULL;
