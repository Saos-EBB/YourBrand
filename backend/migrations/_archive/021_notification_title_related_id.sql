-- 021_notification_title_related_id.sql
-- Erweitert Notifications um title (Kurztext für Push/Anzeige) und related_id
-- (referenziert z. B. eine Beef-ID oder Konversation für Deep-Links).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255) NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id TEXT NULL;
