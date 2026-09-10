-- 028_notification_content_vars.sql
-- JSONB-Spalte für i18n-Variablen in Notification-Templates (z. B. {nickname},
-- {amount}) — ermöglicht typsichere Übersetzungen ohne hartcodierte Strings.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS content_vars JSONB;
