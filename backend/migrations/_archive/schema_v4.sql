-- ============================================================
--  PAARSHIP – Datenbankschema v4
--  PostgreSQL 16 + PostGIS 3.4
--  DSGVO-konform | AES-256 (pgcrypto) | bcrypt | SHA-256+Salt
--  DB-Level: Triggers, Constraints, Regex-Checks, RLS-vorbereitet
-- ============================================================
-- Ausführen:
--   docker exec -i paarship_db psql -U paarship_user -d paarship < schema_v4.sql
-- ============================================================
-- Änderungen gegenüber v3:
--   FIX 1: System-User email_search_hash auf exakt 64 Zeichen
--   FIX 2: Ban-Expiry Cronjob-View + Trigger-Logik korrigiert
--   FIX 3: Consent-Widerruf Trigger löscht profile_sensitive_data
--   FIX 5: Pseudonymisierung löscht refresh_tokens
--   FIX 6: contact_requests – declined/expired können neu gestellt werden
--   FIX 7: agb_versions – nur eine is_current=true pro type via Trigger
--   FIX 8: vulnerable_flag_audit – ON DELETE SET DEFAULT zu System-User
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
--  SYSTEM USER für Pseudonymisierung (DSGVO Art. 17)
--  Dieser User wird niemals gelöscht.
--  user_id in consent_logs / payment_logs wird auf diese UUID
--  gesetzt wenn ein echter User pseudonymisiert wird.
-- ============================================================
-- Wird nach der users-Tabelle eingefügt (siehe unten)


-- ============================================================
--  ENUMs
-- ============================================================

CREATE TYPE user_role            AS ENUM ('user', 'admin', 'org');
CREATE TYPE account_type         AS ENUM ('standard', 'managed');
CREATE TYPE font_size_option     AS ENUM ('normal', 'large', 'xl');
CREATE TYPE org_member_role      AS ENUM ('admin', 'member');
CREATE TYPE agb_type             AS ENUM ('agb', 'privacy', 'sensitive_data');
CREATE TYPE media_file_type      AS ENUM ('image', 'audio');
CREATE TYPE media_context        AS ENUM ('profile', 'chat', 'org');
CREATE TYPE moderation_status    AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE request_status       AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE conversation_status  AS ENUM ('active', 'blocked', 'deleted');
CREATE TYPE message_type         AS ENUM ('text', 'image', 'audio');
CREATE TYPE report_reason        AS ENUM ('harassment', 'spam', 'fake', 'sexual', 'abuse');
CREATE TYPE report_status        AS ENUM ('open', 'reviewed', 'closed');
CREATE TYPE intent_category      AS ENUM ('mistake', 'repeat', 'malicious');
CREATE TYPE strike_type          AS ENUM ('warning', 'temp', 'permanent');
CREATE TYPE subscription_plan    AS ENUM ('monthly', 'yearly', 'lifetime');
CREATE TYPE subscription_status  AS ENUM ('active', 'cancelled', 'expired');
CREATE TYPE payment_provider     AS ENUM ('paypal', 'sepa');
CREATE TYPE payment_status       AS ENUM ('success', 'failed', 'refunded');
CREATE TYPE notification_type    AS ENUM ('message', 'match', 'system', 'ban', 'request');
CREATE TYPE appeal_status        AS ENUM ('open', 'approved', 'rejected');
CREATE TYPE severity_level       AS ENUM ('low', 'medium', 'high');
CREATE TYPE device_type          AS ENUM ('ios', 'android', 'web');
CREATE TYPE video_status         AS ENUM ('pending', 'active', 'ended');
CREATE TYPE invoice_status       AS ENUM ('draft', 'issued', 'paid');
CREATE TYPE conv_member_role     AS ENUM ('member', 'admin');


-- ============================================================
--  TRIGGER FUNCTION: updated_at automatisch setzen
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  TRIGGER FUNCTION: conversations user_a/b automatisch sortieren
--  Damit kann das Backend nie vergessen zu sortieren
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_sort_conversation_users()
RETURNS TRIGGER AS $$
DECLARE
  a UUID;
  b UUID;
BEGIN
  IF NEW.user_a_id > NEW.user_b_id THEN
    a := NEW.user_b_id;
    b := NEW.user_a_id;
    NEW.user_a_id := a;
    NEW.user_b_id := b;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  TRIGGER FUNCTION: Pseudonymisierung nach 30 Tagen
--  Wird vom Backend-Cronjob aufgerufen (nicht pg_cron)
--  Pseudonymisiert: email, email_search_hash, nickname
--  Setzt user_id in consent_logs auf SYSTEM_USER
-- ============================================================
CREATE OR REPLACE FUNCTION pseudonymize_user(target_user_id UUID)
RETURNS VOID AS $$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Sicherheitscheck: nur pseudonymisieren wenn deleted_at gesetzt
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = target_user_id
      AND deleted_at IS NOT NULL
      AND pseudonymized_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User % kann nicht pseudonymisiert werden: nicht gelöscht oder bereits pseudonymisiert', target_user_id;
  END IF;

  -- FIX 5: Alle Refresh-Tokens löschen (User kann sich nicht mehr einloggen)
  DELETE FROM refresh_tokens WHERE user_id = target_user_id;

  -- User-Felder anonymisieren
  UPDATE users SET
    email               = NULL,
    email_search_hash   = NULL,
    google_id_hash      = NULL,
    password_hash       = NULL,
    ban_reason          = NULL,
    pseudonymized_at    = NOW()
  WHERE id = target_user_id;

  -- Profil anonymisieren
  UPDATE profiles SET
    nickname    = 'Gelöschter Nutzer',
    bio         = NULL,
    city        = NULL,
    location    = NULL,
    photo_id    = NULL
  WHERE user_id = target_user_id;

  -- Art.9 Daten löschen (DSGVO Pflicht)
  DELETE FROM profile_sensitive_data
  WHERE user_id = target_user_id;

  -- consent_logs: user_id auf System-User setzen (Nachweispflicht bleibt)
  UPDATE consent_logs SET
    user_id = system_user_id
  WHERE user_id = target_user_id;

  -- payment_logs: user_id auf System-User setzen (§ 147 AO Aufbewahrung bleibt)
  UPDATE payment_logs SET
    user_id = system_user_id
  WHERE user_id = target_user_id;

END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  TRIGGER FUNCTION: Ban automatisch aufheben
--  FIX 2: Trigger feuert bei UPDATE auf strikes.
--  ABER: Ban-Ablauf beim Login muss das Backend zusätzlich prüfen
--  via View: users_with_expired_bans (siehe unten)
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_check_ban_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= NOW() THEN
    UPDATE users SET
      is_banned       = false,
      ban_reason      = NULL,
      ban_expires_at  = NULL
    WHERE id = NEW.user_id
      AND is_banned = true;  -- nur wenn tatsächlich gebannt

    NEW.ban_lifted_at   = NOW();
    NEW.lifted_by_job   = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  TRIGGER FUNCTION: consent_pflicht für profile_sensitive_data
--  Art.9 Daten dürfen nur gespeichert werden wenn:
--  1. consent_id existiert
--  2. Der Consent accepted = true ist
--  3. Der Consent für type = 'sensitive_data' ist
--  4. Der Consent nicht widerrufen wurde (withdrawn_at IS NULL)
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_check_art9_consent()
RETURNS TRIGGER AS $$
DECLARE
  consent_valid BOOLEAN;
BEGIN
  SELECT (
    c.accepted = true
    AND a.type = 'sensitive_data'
    AND c.withdrawn_at IS NULL  -- FIX 3: widerrufener Consent ist ungültig
  )
  INTO consent_valid
  FROM consent_logs c
  JOIN agb_versions a ON a.id = c.agb_version_id
  WHERE c.id = NEW.consent_id
    AND c.user_id = NEW.user_id;

  IF consent_valid IS NULL OR consent_valid = false THEN
    RAISE EXCEPTION 'Art.9 DSGVO: Keine gültige Einwilligung für Gesundheitsdaten vorhanden. consent_id: %', NEW.consent_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  TRIGGER FUNCTION: Consent-Widerruf → profile_sensitive_data löschen
--  FIX 3: Wenn withdrawn_at gesetzt wird, Art.9 Daten sofort löschen
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_consent_withdrawal()
RETURNS TRIGGER AS $$
BEGIN
  -- Nur wenn withdrawn_at neu gesetzt wird (war vorher NULL)
  IF OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL THEN
    -- Art.9 Daten des Users löschen
    DELETE FROM profile_sensitive_data
    WHERE user_id = NEW.user_id
      AND consent_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  TRIGGER FUNCTION: agb_versions – nur eine is_current pro type
--  FIX 7: Wenn eine Version auf is_current=true gesetzt wird,
--  alle anderen Versionen desselben Typs auf false setzen
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_agb_single_current()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE agb_versions SET
      is_current = false
    WHERE type = NEW.type
      AND id != NEW.id
      AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  TRIGGER FUNCTION: vulnerable_flag Audit
--  Jede Änderung von vulnerable_flag wird geloggt
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_log_vulnerable_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.vulnerable_flag IS DISTINCT FROM NEW.vulnerable_flag THEN
    INSERT INTO vulnerable_flag_audit (
      user_id, old_value, new_value, changed_at
    ) VALUES (
      NEW.id, OLD.vulnerable_flag, NEW.vulnerable_flag, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  SECTION: USER & AUTH
-- ============================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Email AES-256 (BYTEA), Suche via email_search_hash
    email               BYTEA NULL,
    email_search_hash   VARCHAR(64) NULL,
    CONSTRAINT uq_users_email_hash UNIQUE (email_search_hash),
    CONSTRAINT chk_users_email_hash_length
        CHECK (email_search_hash IS NULL OR length(email_search_hash) = 64),

    password_hash       VARCHAR NULL,

    google_id_hash      VARCHAR(64) NULL,
    CONSTRAINT uq_users_google_id UNIQUE (google_id_hash),
    CONSTRAINT chk_users_google_hash_length
        CHECK (google_id_hash IS NULL OR length(google_id_hash) = 64),

    preferred_locale    VARCHAR(10) NULL,
    CONSTRAINT chk_users_locale
        CHECK (preferred_locale IS NULL OR preferred_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),

    role                user_role NOT NULL DEFAULT 'user',
    account_type        account_type NOT NULL DEFAULT 'standard',

    is_verified         BOOLEAN NOT NULL DEFAULT false,
    is_banned           BOOLEAN NOT NULL DEFAULT false,
    ban_reason          TEXT NULL,
    ban_expires_at      TIMESTAMP WITH TIME ZONE NULL,

    -- Art.9: nur Admin/Caretaker darf setzen – Backend-Guard + Audit-Trigger
    vulnerable_flag     BOOLEAN NOT NULL DEFAULT false,
    enhanced_protection BOOLEAN NOT NULL DEFAULT false,

    email_verified_at               TIMESTAMP WITH TIME ZONE NULL,
    email_verification_token        VARCHAR(128) NULL,
    email_verification_expires_at   TIMESTAMP WITH TIME ZONE NULL,
    password_reset_token            VARCHAR(128) NULL,
    password_reset_expires_at       TIMESTAMP WITH TIME ZONE NULL,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login          TIMESTAMP WITH TIME ZONE NULL,
    deleted_at          TIMESTAMP WITH TIME ZONE NULL,
    pseudonymized_at    TIMESTAMP WITH TIME ZONE NULL,

    -- Mindestens eine Login-Methode muss vorhanden sein
    CONSTRAINT chk_users_login_method
        CHECK (email_search_hash IS NOT NULL OR google_id_hash IS NOT NULL),

    -- Ban-Logik: wenn gebannt muss Grund angegeben sein
    CONSTRAINT chk_users_ban_reason
        CHECK (is_banned = false OR ban_reason IS NOT NULL),

    -- Pseudonymisierung nur nach Soft-Delete
    CONSTRAINT chk_users_pseudonymized_after_deleted
        CHECK (pseudonymized_at IS NULL OR deleted_at IS NOT NULL)
);

COMMENT ON COLUMN users.email IS 'AES-256 (pgcrypto). Nie im Klartext in der DB.';
COMMENT ON COLUMN users.email_search_hash IS 'SHA-256 + App-Salt. Exakt 64 Zeichen.';
COMMENT ON COLUMN users.vulnerable_flag IS 'Art.9 – nur Admin/Caretaker. Backend-Guard + Audit-Trigger.';


-- Audit-Tabelle für vulnerable_flag (braucht users zuerst)
CREATE TABLE vulnerable_flag_audit (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- SET DEFAULT statt CASCADE: Audit-Log bleibt erhalten wenn User gelöscht wird
    -- user_id zeigt dann auf System-User (00000000-...) für Nachvollziehbarkeit
    user_id     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                REFERENCES users(id) ON DELETE SET DEFAULT,
    old_value   BOOLEAN NOT NULL,
    new_value   BOOLEAN NOT NULL,
    changed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);


-- System-User für Pseudonymisierung (NIEMALS löschen)
INSERT INTO users (
    id, role, account_type, is_verified,
    email_search_hash, password_hash
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'admin', 'standard', true,
    'system-deleted-user-placeholder-00000000000000000000000000000000',  -- exakt 64 Zeichen
    'system-no-login'
);

COMMENT ON TABLE vulnerable_flag_audit IS 'Jede Änderung von vulnerable_flag wird hier geloggt. Unveränderlich.';


-- Trigger: vulnerable_flag Audit
CREATE TRIGGER trg_users_vulnerable_flag_audit
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_log_vulnerable_flag();


-- ============================================================
--  refresh_tokens
-- ============================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL,
    CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_refresh_token_hash_length
        CHECK (length(token_hash) = 64),
    device_info VARCHAR(255) NULL,
    is_revoked  BOOLEAN NOT NULL DEFAULT false,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_refresh_expires_future
        CHECK (expires_at > created_at)
);


-- ============================================================
--  agb_versions
-- ============================================================
CREATE TABLE agb_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version         VARCHAR(20) NOT NULL,
    CONSTRAINT chk_agb_version_format
        CHECK (version ~ '^\d+\.\d+(\.\d+)?$'),
    type            agb_type NOT NULL,
    content_normal  TEXT NOT NULL,
    content_simple  TEXT NOT NULL,
    content_url     VARCHAR(512) NULL,
    CONSTRAINT chk_agb_content_url
        CHECK (content_url IS NULL OR content_url ~ '^https://'),
    valid_from      TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until     TIMESTAMP WITH TIME ZONE NULL,
    is_current      BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT uq_agb_version_type UNIQUE (version, type),
    CONSTRAINT chk_agb_valid_range
        CHECK (valid_until IS NULL OR valid_until > valid_from)
);

COMMENT ON COLUMN agb_versions.content_simple IS 'Leichte Sprache – Pflicht für Barrierefreiheit.';
COMMENT ON COLUMN agb_versions.version IS 'Format: 1.0 oder 1.0.1';

-- FIX 7: Trigger – nur eine is_current=true pro type erlaubt
CREATE TRIGGER trg_agb_single_current
  BEFORE INSERT OR UPDATE ON agb_versions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_agb_single_current();


-- ============================================================
--  consent_logs  (DSGVO Art. 7 – Nachweispflicht)
-- ============================================================
CREATE TABLE consent_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    agb_version_id  UUID NOT NULL REFERENCES agb_versions(id) ON DELETE RESTRICT,
    accepted        BOOLEAN NOT NULL,
    accepted_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_hash         VARCHAR(64) NOT NULL,
    CONSTRAINT chk_consent_ip_hash_length
        CHECK (length(ip_hash) = 64),
    tp_hash         VARCHAR(64) NULL,
    withdrawn_at    TIMESTAMP WITH TIME ZONE NULL,
    withdraw_reason TEXT NULL,
    CONSTRAINT uq_consent_user_version UNIQUE (user_id, agb_version_id),
    CONSTRAINT chk_consent_withdraw_after_accept
        CHECK (withdrawn_at IS NULL OR withdrawn_at > accepted_at)
);

COMMENT ON TABLE consent_logs IS 'DSGVO Art.7: Nachweispflicht. ON DELETE RESTRICT. user_id wird pseudonymisiert nicht gelöscht.';

-- FIX 3: Trigger für Consent-Widerruf → löscht profile_sensitive_data
CREATE TRIGGER trg_consent_withdrawal
  AFTER UPDATE ON consent_logs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_consent_withdrawal();


-- ============================================================
--  media_uploads
-- ============================================================
CREATE TABLE media_uploads (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploaded_by         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_url            VARCHAR(1024) NOT NULL,
    CONSTRAINT chk_media_file_url
        CHECK (file_url ~ '^https://'),
    file_type           media_file_type NOT NULL,
    file_use_for        VARCHAR(100) NULL,
    context             media_context NOT NULL,
    conversation_id     UUID NULL,
    org_id              UUID NULL,
    moderation_status   moderation_status NOT NULL DEFAULT 'pending',
    is_encrypted        BOOLEAN NOT NULL DEFAULT false,
    file_size_kb        INTEGER NOT NULL,
    CONSTRAINT chk_media_file_size
        CHECK (file_size_kb > 0 AND file_size_kb <= 51200),
    uploaded_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMP WITH TIME ZONE NULL,
    purged_at           TIMESTAMP WITH TIME ZONE NULL,
    CONSTRAINT chk_media_purge_after_delete
        CHECK (purged_at IS NULL OR (deleted_at IS NOT NULL AND purged_at > deleted_at))
);


-- ============================================================
--  profiles
-- ============================================================
CREATE TABLE profiles (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_profiles_user UNIQUE (user_id),

    nickname                VARCHAR(30) NOT NULL,
    CONSTRAINT uq_profiles_nickname UNIQUE (nickname),
    CONSTRAINT chk_profiles_nickname
        CHECK (nickname ~ '^[a-zA-Z0-9_\-\.]{3,30}$'),

    birthdate               DATE NOT NULL,
    CONSTRAINT chk_profiles_birthdate_min_age
        CHECK (birthdate <= CURRENT_DATE - INTERVAL '18 years'),

    bio                     TEXT NULL,
    CONSTRAINT chk_profiles_bio_length
        CHECK (bio IS NULL OR length(bio) <= 1000),

    photo_id                UUID NULL REFERENCES media_uploads(id) ON DELETE SET NULL,
    city                    VARCHAR(100) NULL,
    location                GEOGRAPHY(Point, 4326) NULL, -- nach Erstbefüllung: npm run backfill:locations (geocodiert city → PostGIS-Punkt; 2026-06-10 ausgeführt: 39/45 Profile)
    search_radius_km        INTEGER NOT NULL DEFAULT 20,
    CONSTRAINT chk_profiles_radius
        CHECK (search_radius_km > 0 AND search_radius_km <= 500),

    lang_simple             BOOLEAN NOT NULL DEFAULT false,
    font_size               font_size_option NOT NULL DEFAULT 'normal',
    high_contrast           BOOLEAN NOT NULL DEFAULT false,
    is_published            BOOLEAN NOT NULL DEFAULT false,
    onboarding_completed    BOOLEAN NOT NULL DEFAULT false,
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Nur veröffentlichen wenn Onboarding abgeschlossen
    CONSTRAINT chk_profiles_publish_requires_onboarding
        CHECK (is_published = false OR onboarding_completed = true)
);

-- Trigger: updated_at
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================
--  profile_sensitive_data  (DSGVO Art. 9)
-- ============================================================
CREATE TABLE profile_sensitive_data (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_sensitive_user UNIQUE (user_id),
    consent_id          UUID NOT NULL REFERENCES consent_logs(id) ON DELETE RESTRICT,
    disability_type     BYTEA NULL,
    disability_visible  BOOLEAN NOT NULL DEFAULT false,
    collected_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profile_sensitive_data IS 'Art.9 DSGVO. Eigene Einwilligung (consent_id) zwingend. AES-256.';

-- Trigger: Art.9 Consent prüfen
CREATE TRIGGER trg_sensitive_data_consent_check
  BEFORE INSERT OR UPDATE ON profile_sensitive_data
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_art9_consent();

-- Trigger: updated_at
CREATE TRIGGER trg_sensitive_data_updated_at
  BEFORE UPDATE ON profile_sensitive_data
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================
--  managed_accounts  (Caretaker)
-- ============================================================
CREATE TABLE managed_accounts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caretaker_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_log_id      UUID NULL REFERENCES consent_logs(id) ON DELETE SET NULL,
    can_read_chat       BOOLEAN NOT NULL DEFAULT false,
    can_write_chat      BOOLEAN NOT NULL DEFAULT false,
    can_set_protection  BOOLEAN NOT NULL DEFAULT true,
    expires_at          TIMESTAMP WITH TIME ZONE NULL,
    revoked_at          TIMESTAMP WITH TIME ZONE NULL,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_managed_user_caretaker UNIQUE (user_id, caretaker_id),
    CONSTRAINT chk_managed_no_self CHECK (user_id <> caretaker_id),
    CONSTRAINT chk_managed_revoke_after_create
        CHECK (revoked_at IS NULL OR revoked_at > created_at)
);


-- ============================================================
--  organizations
-- ============================================================
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name            VARCHAR(100) NOT NULL,
    CONSTRAINT chk_org_name_length
        CHECK (length(trim(name)) >= 2),
    logo_id         UUID NULL REFERENCES media_uploads(id) ON DELETE SET NULL,
    description     TEXT NULL,
    CONSTRAINT chk_org_description_length
        CHECK (description IS NULL OR length(description) <= 2000),
    is_verified     BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE NULL
);


-- ============================================================
--  org_members
-- ============================================================
CREATE TABLE org_members (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    role        org_member_role NOT NULL DEFAULT 'member',
    joined_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    left_at     TIMESTAMP WITH TIME ZONE NULL,
    CONSTRAINT uq_org_members UNIQUE (org_id, user_id),
    CONSTRAINT chk_org_member_left_after_join
        CHECK (left_at IS NULL OR left_at > joined_at)
);


-- ============================================================
--  interests
-- ============================================================
CREATE TABLE interests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_de     VARCHAR(50) NOT NULL,
    CONSTRAINT uq_interests_name_de UNIQUE (name_de),
    CONSTRAINT chk_interests_name_de
        CHECK (length(trim(name_de)) >= 2),
    name_en     VARCHAR(50) NULL,
    category    VARCHAR(50) NULL
);


-- ============================================================
--  user_interests
-- ============================================================
CREATE TABLE user_interests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interest_id UUID NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_interest UNIQUE (user_id, interest_id)
);


-- ============================================================
--  SECTION: CHAT
-- ============================================================

CREATE TABLE contact_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          request_status NOT NULL DEFAULT 'pending',
    message_preview TEXT NULL,
    CONSTRAINT chk_contact_preview_length
        CHECK (message_preview IS NULL OR length(message_preview) <= 300),
    expired_at      TIMESTAMP WITH TIME ZONE NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    responded_at    TIMESTAMP WITH TIME ZONE NULL,
    -- FIX 6: Kein globales UNIQUE(sender_id, receiver_id) mehr.
    -- Stattdessen: nur eine aktive Anfrage pro Paar erlaubt (pending oder accepted).
    -- declined/expired Anfragen blockieren keine neue Anfrage.
    CONSTRAINT uq_contact_request_active
        EXCLUDE USING btree (sender_id WITH =, receiver_id WITH =)
        WHERE (status IN ('pending', 'accepted')),
    CONSTRAINT chk_contact_no_self CHECK (sender_id <> receiver_id),
    CONSTRAINT chk_contact_respond_after_create
        CHECK (responded_at IS NULL OR responded_at >= created_at)
);


-- ============================================================
--  conversations
-- ============================================================
CREATE TABLE conversations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_a_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_request_id  UUID NOT NULL REFERENCES contact_requests(id) ON DELETE RESTRICT,
    status              conversation_status NOT NULL DEFAULT 'active',
    images_enabled      BOOLEAN NOT NULL DEFAULT false,
    audio_enabled       BOOLEAN NOT NULL DEFAULT false,
    video_enabled       BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_message_at     TIMESTAMP WITH TIME ZONE NULL,
    deleted_at          TIMESTAMP WITH TIME ZONE NULL,
    purged_at           TIMESTAMP WITH TIME ZONE NULL,
    CONSTRAINT uq_conversation_users UNIQUE (user_a_id, user_b_id),
    CONSTRAINT chk_conversation_user_order CHECK (user_a_id < user_b_id),
    CONSTRAINT chk_conversation_no_self CHECK (user_a_id <> user_b_id),
    CONSTRAINT chk_conv_purge_after_delete
        CHECK (purged_at IS NULL OR (deleted_at IS NOT NULL AND purged_at > deleted_at))
);

COMMENT ON CONSTRAINT chk_conversation_user_order ON conversations
  IS 'DB-Trigger sortiert automatisch. user_a_id immer < user_b_id.';

-- Trigger: automatisch sortieren
CREATE TRIGGER trg_conversations_sort_users
  BEFORE INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sort_conversation_users();


-- ============================================================
--  messages
-- ============================================================
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NULL,
    CONSTRAINT chk_message_content_length
        CHECK (content IS NULL OR length(content) <= 10000),
    media_id        UUID NULL REFERENCES media_uploads(id) ON DELETE SET NULL,
    type            message_type NOT NULL DEFAULT 'text',
    is_deleted      BOOLEAN NOT NULL DEFAULT false,
    flagged         BOOLEAN NOT NULL DEFAULT false,
    flagged_by      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    flagged_at      TIMESTAMP WITH TIME ZONE NULL,
    read_at         TIMESTAMP WITH TIME ZONE NULL,
    sent_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE NULL,
    purged_at       TIMESTAMP WITH TIME ZONE NULL,
    CONSTRAINT chk_message_has_content
        CHECK (
            (type = 'text' AND content IS NOT NULL) OR
            (type IN ('image', 'audio') AND media_id IS NOT NULL)
        ),
    CONSTRAINT chk_message_flag_consistency
        CHECK (
            (flagged = false AND flagged_by IS NULL AND flagged_at IS NULL) OR
            (flagged = true AND flagged_by IS NOT NULL AND flagged_at IS NOT NULL)
        ),
    CONSTRAINT chk_message_purge_after_delete
        CHECK (purged_at IS NULL OR (deleted_at IS NOT NULL AND purged_at > deleted_at)),
    CONSTRAINT chk_message_read_after_sent
        CHECK (read_at IS NULL OR read_at >= sent_at)
);


-- ============================================================
--  blocks
-- ============================================================
CREATE TABLE blocks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NULL,
    CONSTRAINT chk_block_reason_length
        CHECK (reason IS NULL OR length(reason) <= 500),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_block UNIQUE (blocker_id, blocked_id),
    CONSTRAINT chk_block_no_self CHECK (blocker_id <> blocked_id)
);


-- ============================================================
--  SECTION: MODERATION
-- ============================================================

CREATE TABLE reports (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id          UUID NULL REFERENCES messages(id) ON DELETE SET NULL,
    reason              report_reason NOT NULL,
    description         TEXT NULL,
    CONSTRAINT chk_report_description_length
        CHECK (description IS NULL OR length(description) <= 2000),
    status              report_status NOT NULL DEFAULT 'open',
    intent_category     intent_category NULL,
    reviewed_by         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reviewed_at         TIMESTAMP WITH TIME ZONE NULL,
    deleted_at          TIMESTAMP WITH TIME ZONE NULL,
    CONSTRAINT chk_report_no_self CHECK (reporter_id <> reported_user_id),
    CONSTRAINT chk_report_reviewed_after_created
        CHECK (reviewed_at IS NULL OR reviewed_at >= created_at)
);


CREATE TABLE strikes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_id       UUID NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
    issued_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type            strike_type NOT NULL,
    reason          TEXT NOT NULL,
    CONSTRAINT chk_strike_reason_length
        CHECK (length(reason) >= 10 AND length(reason) <= 2000),
    expires_at      TIMESTAMP WITH TIME ZONE NULL,
    ban_lifted_at   TIMESTAMP WITH TIME ZONE NULL,
    lifted_by_job   BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_strike_not_self_issued CHECK (user_id <> issued_by),
    CONSTRAINT chk_strike_temp_needs_expiry
        CHECK (type != 'temp' OR expires_at IS NOT NULL),
    CONSTRAINT chk_strike_permanent_no_expiry
        CHECK (type != 'permanent' OR expires_at IS NULL)
);

-- Trigger: Ban automatisch aufheben bei UPDATE
CREATE TRIGGER trg_strikes_check_ban_expiry
  BEFORE UPDATE ON strikes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_ban_expiry();


-- ============================================================
--  SECTION: PAYMENT
-- ============================================================

CREATE TABLE subscriptions (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan                     subscription_plan NOT NULL,
    status                   subscription_status NOT NULL DEFAULT 'active',
    payment_provider         payment_provider NOT NULL,
    provider_subscription_id VARCHAR(255) NULL,
    started_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at               TIMESTAMP WITH TIME ZONE NULL,
    cancelled_at             TIMESTAMP WITH TIME ZONE NULL,
    CONSTRAINT chk_sub_expires_after_start
        CHECK (expires_at IS NULL OR expires_at > started_at),
    CONSTRAINT chk_sub_cancel_after_start
        CHECK (cancelled_at IS NULL OR cancelled_at >= started_at),
    CONSTRAINT chk_sub_lifetime_no_expiry
        CHECK (plan != 'lifetime' OR expires_at IS NULL)
);


CREATE TABLE payment_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    amount          DECIMAL(10,2) NOT NULL,
    CONSTRAINT chk_payment_amount_positive
        CHECK (amount > 0),
    tax_amount      DECIMAL(10,2) NULL,
    CONSTRAINT chk_payment_tax_positive
        CHECK (tax_amount IS NULL OR tax_amount >= 0),
    currency        VARCHAR(3) NOT NULL DEFAULT 'EUR',
    CONSTRAINT chk_payment_currency
        CHECK (currency ~ '^[A-Z]{3}$'),
    status          payment_status NOT NULL,
    provider_tx_id  VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payment_logs IS '§ 147 AO: 7 Jahre Aufbewahrungspflicht. ON DELETE RESTRICT.';


-- ============================================================
--  SECTION: BENACHRICHTIGUNGEN
-- ============================================================

CREATE TABLE notification_settings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_notification_settings_user UNIQUE (user_id),
    email_messages  BOOLEAN NOT NULL DEFAULT true,
    email_matches   BOOLEAN NOT NULL DEFAULT true,
    email_system    BOOLEAN NOT NULL DEFAULT true,
    push_messages   BOOLEAN NOT NULL DEFAULT true,
    push_matches    BOOLEAN NOT NULL DEFAULT true,
    push_system     BOOLEAN NOT NULL DEFAULT true,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Trigger: updated_at
CREATE TRIGGER trg_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();


CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        notification_type NOT NULL,
    content     TEXT NOT NULL,
    CONSTRAINT chk_notification_content_length
        CHECK (length(content) <= 500),
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);


-- ============================================================
--  INDEXES
-- ============================================================

-- users
CREATE INDEX idx_users_role            ON users(role);
CREATE INDEX idx_users_is_banned       ON users(is_banned);
CREATE INDEX idx_users_deleted_at      ON users(deleted_at);
CREATE INDEX idx_users_pseudonymized   ON users(pseudonymized_at) WHERE pseudonymized_at IS NULL;
CREATE INDEX idx_users_vulnerable      ON users(vulnerable_flag) WHERE vulnerable_flag = true;

-- profiles
CREATE INDEX idx_profiles_location     ON profiles USING GIST(location);
CREATE INDEX idx_profiles_published    ON profiles(is_published) WHERE is_published = true;
CREATE INDEX idx_profiles_city         ON profiles(city);

-- profile_sensitive_data
CREATE INDEX idx_sensitive_user        ON profile_sensitive_data(user_id);
CREATE INDEX idx_sensitive_visible     ON profile_sensitive_data(disability_visible) WHERE disability_visible = true;

-- refresh_tokens
CREATE INDEX idx_refresh_user          ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_expires       ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_revoked       ON refresh_tokens(is_revoked) WHERE is_revoked = false;

-- contact_requests
CREATE INDEX idx_contact_receiver      ON contact_requests(receiver_id);
CREATE INDEX idx_contact_status        ON contact_requests(status);

-- conversations
CREATE INDEX idx_conv_user_a           ON conversations(user_a_id);
CREATE INDEX idx_conv_user_b           ON conversations(user_b_id);
CREATE INDEX idx_conv_last_msg         ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX idx_conv_deleted          ON conversations(deleted_at) WHERE deleted_at IS NOT NULL;

-- messages
CREATE INDEX idx_msg_conversation      ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_msg_sender            ON messages(sender_id);
CREATE INDEX idx_msg_flagged           ON messages(flagged) WHERE flagged = true;
CREATE INDEX idx_msg_unread            ON messages(read_at) WHERE read_at IS NULL;
CREATE INDEX idx_msg_deleted           ON messages(deleted_at) WHERE deleted_at IS NOT NULL;

-- blocks
CREATE INDEX idx_blocks_blocker        ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked        ON blocks(blocked_id);

-- reports
CREATE INDEX idx_reports_status        ON reports(status);
CREATE INDEX idx_reports_reported      ON reports(reported_user_id);

-- strikes
CREATE INDEX idx_strikes_user          ON strikes(user_id);
CREATE INDEX idx_strikes_expires       ON strikes(expires_at) WHERE expires_at IS NOT NULL;

-- subscriptions
CREATE INDEX idx_sub_user              ON subscriptions(user_id);
CREATE INDEX idx_sub_status            ON subscriptions(status);
CREATE INDEX idx_sub_expires           ON subscriptions(expires_at) WHERE expires_at IS NOT NULL;

-- notifications
CREATE INDEX idx_notif_user_unread     ON notifications(user_id, is_read) WHERE is_read = false;

-- consent_logs
CREATE INDEX idx_consent_user          ON consent_logs(user_id);

-- user_interests
CREATE INDEX idx_user_interests_user   ON user_interests(user_id);

-- media_uploads
CREATE INDEX idx_media_uploader        ON media_uploads(uploaded_by);
CREATE INDEX idx_media_moderation      ON media_uploads(moderation_status);
CREATE INDEX idx_media_deleted         ON media_uploads(deleted_at) WHERE deleted_at IS NOT NULL;

-- vulnerable_flag_audit
CREATE INDEX idx_vuln_audit_user       ON vulnerable_flag_audit(user_id);
CREATE INDEX idx_vuln_audit_changed    ON vulnerable_flag_audit(changed_at);


-- ============================================================
--  DSGVO CRONJOB HELPER VIEW
--  Backend-Cronjob nutzt diese View um zu wissen
--  welche User pseudonymisiert werden müssen
-- ============================================================
CREATE VIEW users_pending_pseudonymization AS
  SELECT id, deleted_at
  FROM users
  WHERE deleted_at IS NOT NULL
    AND pseudonymized_at IS NULL
    AND deleted_at < NOW() - INTERVAL '30 days'
    AND id != '00000000-0000-0000-0000-000000000000';

COMMENT ON VIEW users_pending_pseudonymization IS
  'Cronjob ruft diese View ab und ruft pseudonymize_user(id) für jeden Eintrag auf.';


-- ============================================================
--  FIX 2: Ban-Expiry Cronjob Helper View
--  Trigger hebt Ban auf bei strikes UPDATE, aber wenn kein UPDATE
--  passiert muss der Backend-Cronjob (oder Login-Check) diese
--  View abfragen und ban manuell aufheben.
-- ============================================================
CREATE VIEW users_with_expired_bans AS
  SELECT id, ban_expires_at
  FROM users
  WHERE is_banned = true
    AND ban_expires_at IS NOT NULL
    AND ban_expires_at <= NOW()
    AND id != '00000000-0000-0000-0000-000000000000';

COMMENT ON VIEW users_with_expired_bans IS
  'Backend-Cronjob und Login-Check: User hier drin müssen is_banned=false gesetzt werden.';


-- ============================================================
--  DSGVO DOKUMENTATION
-- ============================================================
-- Art. 17 Löschkonzept:
--   1. users.deleted_at = NOW()  (Soft Delete, sofort)
--   2. Nach 30 Tagen: pseudonymize_user(id) aufrufen
--      → refresh_tokens: DELETE (User kann sich nicht mehr einloggen)
--      → email/email_search_hash/google_id_hash = NULL
--      → profiles.nickname = 'Gelöschter Nutzer', bio/city/location = NULL
--      → profile_sensitive_data: DELETE (Art.9 Pflicht)
--      → consent_logs.user_id → System-User (Nachweispflicht bleibt)
--      → payment_logs.user_id → System-User (§ 147 AO bleibt)
--      → vulnerable_flag_audit.user_id → System-User (Audit bleibt)
--
-- Art. 7 Consent:
--   → consent_logs nie löschen, nur pseudonymisieren
--   → profile_sensitive_data braucht eigenen Art.9 Consent
--   → Widerruf (withdrawn_at) löscht sofort profile_sensitive_data via Trigger
--
-- Art. 15 Auskunft:
--   → alle Tabellen mit user_id per JOIN exportierbar
--   → profile_sensitive_data nur nach AES-Entschlüsselung
--
-- § 147 AO:
--   → payment_logs: 7 Jahre, ON DELETE RESTRICT
--
-- Ban-Management:
--   → Trigger auf strikes hebt Ban auf bei UPDATE
--   → Cronjob/Login-Check muss users_with_expired_bans View abfragen
-- ============================================================