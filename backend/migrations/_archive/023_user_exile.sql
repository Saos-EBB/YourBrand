-- 023_user_exile.sql
-- Exil-Mechanik für die Hidden Zone: exile_until sperrt einen User temporär
-- vom Beef-System (wird bei Chicken oder Regelverstoß gesetzt, läuft automatisch ab).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS exile_until TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_exile_until
  ON users(exile_until) WHERE exile_until IS NOT NULL;
