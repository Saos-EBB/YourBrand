-- 013_users_last_gdpr_export_at.sql
-- Timestamp des letzten DSGVO-Datenexports (Art. 15 DSGVO). Verhindert
-- Missbrauch durch zu häufige Export-Anfragen (Cooldown-Prüfung im Service).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_gdpr_export_at TIMESTAMP WITH TIME ZONE NULL;
