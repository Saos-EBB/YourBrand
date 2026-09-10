-- 025_beef_duration.sql
-- Konfigurierbare Beef-Laufzeit: duration_seconds pro Beef (Standard 24h = 86400s).
-- Ermöglicht kurze Demo-Beefs (z. B. 15 Minuten) und lange Marathon-Beefs.

ALTER TABLE beefs
  ADD COLUMN IF NOT EXISTS duration_seconds INT NOT NULL DEFAULT 86400;
