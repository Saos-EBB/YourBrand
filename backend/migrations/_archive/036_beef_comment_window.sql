-- 036_beef_comment_window.sql
-- Zeitfenster nach Beef-Ende in dem noch kommentiert werden darf:
-- comment_window_until läuft nach X Stunden ab, danach sind Kommentare gesperrt.

ALTER TABLE beefs ADD COLUMN IF NOT EXISTS comment_window_until TIMESTAMPTZ;
