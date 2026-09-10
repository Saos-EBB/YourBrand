-- ============================================================
--  022_hidden_beef_feature.sql
--  Hidden Zone: Beef, Coins, Teeth, Badges
-- ============================================================

-- users: chicken counter
ALTER TABLE users ADD COLUMN IF NOT EXISTS chicken_count INT NOT NULL DEFAULT 0;

-- ── beefs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beefs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiator_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tldr           VARCHAR(50) NOT NULL,
  chat_passage   TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending_approval',
  admin_approved BOOLEAN NOT NULL DEFAULT false,
  winner_id      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  ends_at        TIMESTAMPTZ NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_beef_no_self
    CHECK (initiator_id != target_id),
  CONSTRAINT chk_beef_status
    CHECK (status IN ('pending_approval','waiting','active','closed','chickened'))
);

-- ── beef_votes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beef_votes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id       UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  voter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side          VARCHAR(10) NOT NULL,
  coins_wagered INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_beef_vote UNIQUE (beef_id, voter_id),
  CONSTRAINT chk_beef_vote_side
    CHECK (side IN ('initiator','target')),
  CONSTRAINT chk_beef_vote_coins
    CHECK (coins_wagered >= 1)
);

-- ── beef_comments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beef_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id    UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_beef_comment_length
    CHECK (char_length(content) BETWEEN 1 AND 500)
);

-- ── coin_transactions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coin_transactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INT NOT NULL,
  type       VARCHAR(30) NOT NULL,
  beef_id    UUID NULL REFERENCES beefs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_coin_tx_type CHECK (type IN (
    'purchase','earned_beef_open','earned_comment',
    'earned_win','earned_vote_win','spent_vote','house_cut','lottery_win'
  ))
);

-- ── user_coin_balance ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_coin_balance (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0,
  CONSTRAINT chk_coin_balance_non_negative CHECK (balance >= 0)
);

-- ── teeth ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teeth (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beef_id            UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  converted_to_chain BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── tooth_chains ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tooth_chains (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── badges ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badges (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beef_id    UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  type       VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_badge_type
    CHECK (type IN ('winner','loser','chicken'))
);
