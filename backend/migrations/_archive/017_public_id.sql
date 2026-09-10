-- Public profile ID: short, human-readable identifier (4 uppercase alphanumeric chars).
-- Used as a visible watermark on profile photos to deter misuse.
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR(12) UNIQUE;

-- Assign unique public_ids to all existing users that don't have one yet.
DO $$
DECLARE
    rec   RECORD;
    cand  VARCHAR(4);
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
BEGIN
    FOR rec IN SELECT id FROM users WHERE public_id IS NULL LOOP
        LOOP
            cand := '';
            FOR i IN 1..4 LOOP
                cand := cand || substr(chars, (floor(random() * 36))::int + 1, 1);
            END LOOP;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE public_id = cand);
        END LOOP;
        UPDATE users SET public_id = cand WHERE id = rec.id;
    END LOOP;
END $$;

-- Watermark prefix used when compositing the ID onto uploaded photos.
INSERT INTO system_settings (key, value)
VALUES ('watermark_prefix', 'ID')
ON CONFLICT (key) DO NOTHING;
