-- 037_matching_feature.sql
-- Matching + Discover: interest flags, swipe decisions, mutual matches

-- Interest flags (all existing rows default to green = liked)
ALTER TABLE user_interests ADD COLUMN IF NOT EXISTS is_green BOOLEAN NOT NULL DEFAULT true;

-- Ensure each user can have each interest at most once (required for ON CONFLICT upsert)
ALTER TABLE user_interests DROP CONSTRAINT IF EXISTS user_interests_user_id_interest_id_key;
ALTER TABLE user_interests ADD CONSTRAINT user_interests_user_id_interest_id_key UNIQUE (user_id, interest_id);

-- Swipe decisions (like / skip)
-- UNIQUE on (swiper_id, swiped_id) — re-swiping upserts the existing row
CREATE TABLE IF NOT EXISTS swipes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swiper_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    swiped_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      VARCHAR(10) NOT NULL CHECK (action IN ('like', 'skip')),
    swiped_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT swipes_pair_unique UNIQUE (swiper_id, swiped_id)
);

-- Index for rolling 24h limit check (swiper + time)
CREATE INDEX IF NOT EXISTS idx_swipes_swiper_at ON swipes (swiper_id, swiped_at);
-- Index for mutual-like detection (did the other person already like me?)
CREATE INDEX IF NOT EXISTS idx_swipes_swiped_action ON swipes (swiped_id, action);

-- Mutual matches (created when both users Liked each other)
-- user_a_id < user_b_id by convention so the pair is always unique
CREATE TABLE IF NOT EXISTS matches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_a_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT matches_pair_unique UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user_a ON matches (user_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_b ON matches (user_b_id);
