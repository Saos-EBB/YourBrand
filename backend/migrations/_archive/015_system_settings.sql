-- Admin-configurable key/value settings with audit trail.
-- Values are strings; callers parse to the appropriate type.
CREATE TABLE IF NOT EXISTS system_settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT         NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by UUID         NULL REFERENCES users(id) ON DELETE SET NULL
);

-- Seed defaults
INSERT INTO system_settings (key, value)
VALUES ('auto_suspend_threshold', '10')
ON CONFLICT (key) DO NOTHING;
