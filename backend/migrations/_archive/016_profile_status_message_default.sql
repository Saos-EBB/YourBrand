-- Migration: set default for status_message to 'available'
ALTER TABLE profiles
    ALTER COLUMN status_message SET DEFAULT 'available';

-- Backfill existing rows where status_message is NULL
UPDATE profiles SET status_message = 'available' WHERE status_message IS NULL;
