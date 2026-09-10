-- 029_beef_game_system.sql
-- Adds game_type + game_deadline_at to beefs, and creates beef_games table.

ALTER TABLE beefs
    ADD COLUMN game_type VARCHAR(30) NOT NULL DEFAULT 'rps',
    ADD COLUMN game_deadline_at TIMESTAMPTZ NULL;

-- Extend status enum
ALTER TABLE beefs
    DROP CONSTRAINT IF EXISTS beefs_status_check;

ALTER TABLE beefs
    ADD CONSTRAINT beefs_status_check
    CHECK (status IN ('pending_approval','waiting','active','game_pending','in_game','closed','chickened'));

CREATE TABLE beef_games (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beef_id       UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
    game_type     VARCHAR(30) NOT NULL,
    state         JSONB NOT NULL DEFAULT '{}',
    move_deadline_at TIMESTAMPTZ NULL,
    initiator_ready  BOOLEAN NOT NULL DEFAULT FALSE,
    target_ready     BOOLEAN NOT NULL DEFAULT FALSE,
    winner_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX beef_games_beef_id_idx ON beef_games(beef_id);
