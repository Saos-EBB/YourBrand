-- 002_gender_looking_for_online_status.sql
-- Fügt Kern-Profilfelder hinzu: gender und looking_for (je als ENUM),
-- sowie last_active_at für den Online-Status-Filter in der Suche.

CREATE TYPE gender_option AS ENUM ('male', 'female', 'non_binary', 'diverse', 'not_specified');
CREATE TYPE looking_for_option AS ENUM ('friendship', 'relationship', 'exchange', 'all');

ALTER TABLE profiles
    ADD COLUMN gender       gender_option  NULL DEFAULT NULL,
    ADD COLUMN looking_for  looking_for_option NULL DEFAULT NULL,
    ADD COLUMN last_active_at TIMESTAMPTZ  NULL DEFAULT NULL;

-- Index for online-only filter
CREATE INDEX idx_profiles_last_active_at ON profiles (last_active_at);
