-- 012_profile_visibility_fields.sql
-- Granulare Sichtbarkeitssteuerung für Profilfelder: jedes Feld (Bio, Stadt,
-- Alter, Geschlecht, Interessen, Audio) kann vom User einzeln ein-/ausgeblendet werden.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS show_bio       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_city      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_age       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_gender    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_interests BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_audio     BOOLEAN NOT NULL DEFAULT true;
