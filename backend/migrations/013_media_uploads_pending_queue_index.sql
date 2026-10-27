-- Moderations-Warteschlange GET /admin/media/pending laedt seit dem Belastbarkeits-Audit (2026-10-27) seitenweise,
-- aelteste zuerst mit Cursor (uploaded_at, id). Der Teilindex deckt Filter, Sortierung und Cursor ab.
CREATE INDEX IF NOT EXISTS idx_media_uploads_pending_queue
    ON media_uploads (uploaded_at, id)
    WHERE moderation_status = 'pending' AND deleted_at IS NULL;
