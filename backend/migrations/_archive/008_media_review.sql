-- 008_media_review.sql
-- Erweitert media_uploads um Moderations-Workflow: needs_review-Flag,
-- reviewed_at/reviewed_by und Ablehnungsgrund. Neue Uploads sind standardmäßig
-- unter Review bis ein Admin sie freigibt oder ablehnt.

ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL DEFAULT NULL;
ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS review_rejected_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_media_uploads_needs_review ON media_uploads(needs_review) WHERE needs_review = true;
