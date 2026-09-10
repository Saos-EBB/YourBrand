-- 005_change_tracking.sql
-- Tracking-Timestamps für editierbare Pflichtfelder: nickname_changed_at und
-- gender_changed_at — ermöglicht Cooldown-Logik bei Profiländerungen.

ALTER TABLE profiles
  ADD COLUMN nickname_changed_at TIMESTAMPTZ NULL DEFAULT NULL,
  ADD COLUMN gender_changed_at   TIMESTAMPTZ NULL DEFAULT NULL;
