-- agb_versions + consent_logs were only in schema_v4.sql, never had a standalone migration.
-- This migration creates them safely (idempotent via IF NOT EXISTS / DO block).

-- ENUM (guard against duplicate if schema_v4 was applied first)
DO $$ BEGIN
    CREATE TYPE agb_type AS ENUM ('agb', 'privacy', 'sensitive_data');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger function: only one is_current=true per type
CREATE OR REPLACE FUNCTION trigger_agb_single_current()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = true THEN
        UPDATE agb_versions SET is_current = false
        WHERE type = NEW.type
          AND id != NEW.id
          AND is_current = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- agb_versions
CREATE TABLE IF NOT EXISTS agb_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version         VARCHAR(20) NOT NULL,
    CONSTRAINT chk_agb_version_format CHECK (version ~ '^\d+\.\d+(\.\d+)?$'),
    type            agb_type NOT NULL,
    content_normal  TEXT NOT NULL,
    content_simple  TEXT NOT NULL,
    content_url     VARCHAR(512) NULL,
    CONSTRAINT chk_agb_content_url CHECK (content_url IS NULL OR content_url ~ '^https://'),
    valid_from      TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until     TIMESTAMP WITH TIME ZONE NULL,
    is_current      BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT uq_agb_version_type UNIQUE (version, type),
    CONSTRAINT chk_agb_valid_range CHECK (valid_until IS NULL OR valid_until > valid_from)
);

COMMENT ON COLUMN agb_versions.content_simple IS 'Leichte Sprache – Pflicht für Barrierefreiheit.';
COMMENT ON COLUMN agb_versions.version IS 'Format: 1.0 oder 1.0.1';

-- Drop + recreate trigger (CREATE TRIGGER has no IF NOT EXISTS in PG < 17)
DO $$ BEGIN
    DROP TRIGGER IF EXISTS trg_agb_single_current ON agb_versions;
END $$;

CREATE TRIGGER trg_agb_single_current
    BEFORE INSERT OR UPDATE ON agb_versions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_agb_single_current();

-- consent_logs (DSGVO Art.7 – Nachweispflicht)
CREATE TABLE IF NOT EXISTS consent_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    agb_version_id  UUID NOT NULL REFERENCES agb_versions(id) ON DELETE RESTRICT,
    accepted        BOOLEAN NOT NULL,
    accepted_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_hash         VARCHAR(64) NOT NULL,
    CONSTRAINT chk_consent_ip_hash_length CHECK (length(ip_hash) = 64),
    tp_hash         VARCHAR(64) NULL,
    withdrawn_at    TIMESTAMP WITH TIME ZONE NULL,
    withdraw_reason TEXT NULL,
    CONSTRAINT uq_consent_user_version UNIQUE (user_id, agb_version_id),
    CONSTRAINT chk_consent_withdraw_after_accept CHECK (withdrawn_at IS NULL OR withdrawn_at > accepted_at)
);

COMMENT ON TABLE consent_logs IS 'DSGVO Art.7: Nachweispflicht. ON DELETE RESTRICT.';
