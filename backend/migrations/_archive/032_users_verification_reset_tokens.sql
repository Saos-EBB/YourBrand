-- email_verification_token and password_reset_token columns were defined in
-- the User entity but never added to schema_v4.sql or any migration.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verification_token       VARCHAR(128) NULL,
    ADD COLUMN IF NOT EXISTS email_verification_expires_at  TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS password_reset_token           VARCHAR(128) NULL,
    ADD COLUMN IF NOT EXISTS password_reset_expires_at      TIMESTAMPTZ  NULL;
