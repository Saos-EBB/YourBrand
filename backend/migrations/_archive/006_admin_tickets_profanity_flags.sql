-- 006_admin_tickets_profanity_flags.sql
-- Legt das Admin-Moderationssystem an: admin_tickets (Meldungen zu Nickname,
-- Bild, Audio, Sonstigem) und profanity_flags (automatisch erkannte Wörter
-- mit Kontext für Moderatoren).

CREATE TYPE ticket_type AS ENUM ('nickname', 'image', 'audio', 'other');
CREATE TYPE ticket_status AS ENUM ('open', 'reviewed', 'resolved', 'dismissed');

CREATE TABLE admin_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type ticket_type NOT NULL,
  status ticket_status NOT NULL DEFAULT 'open',
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_tickets_status ON admin_tickets(status);
CREATE INDEX idx_admin_tickets_type ON admin_tickets(type);
CREATE INDEX idx_admin_tickets_user ON admin_tickets(user_id);

CREATE TABLE profanity_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  context_type TEXT NOT NULL,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profanity_flags_user_time ON profanity_flags(user_id, flagged_at);
