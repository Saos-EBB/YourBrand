-- 003_status_fields.sql
-- Fügt Online-Status-Felder zum Profil hinzu: status_visible (sichtbar ja/nein)
-- und status_message (ENUM: available, busy, do_not_disturb …).

CREATE TYPE status_message_option AS ENUM (
  'available', 'looking_for_chat', 'looking_for_date',
  'busy', 'do_not_disturb'
);
ALTER TABLE profiles
  ADD COLUMN status_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN status_message status_message_option NULL DEFAULT NULL;
