-- Custom profanity words managed by admins at runtime.
-- The static PROFANITY_WORDLIST constant is the base list; this table holds
-- additions that survive server restarts.  ProfanityService.onModuleInit()
-- loads these on startup and adds them to the leo-profanity runtime instance.
CREATE TABLE IF NOT EXISTS profanity_words (
    word        TEXT        PRIMARY KEY,
    added_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin review notes on reports (free-text, internal use only).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS note TEXT DEFAULT NULL;
