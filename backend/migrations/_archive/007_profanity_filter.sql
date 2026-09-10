-- 007_profanity_filter.sql
-- Opt-out-Flag für den Profanity-Filter: profanity_filter = false deaktiviert
-- die automatische Inhaltsprüfung für diesen User (z. B. für Test-Accounts).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profanity_filter BOOLEAN NOT NULL DEFAULT true;
