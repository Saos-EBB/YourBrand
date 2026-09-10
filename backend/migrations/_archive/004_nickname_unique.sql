-- 004_nickname_unique.sql
-- Erzwingt eindeutige Nicknames plattformweit (UNIQUE-Constraint auf profiles.nickname).

ALTER TABLE profiles ADD CONSTRAINT uq_profiles_nickname UNIQUE (nickname);
