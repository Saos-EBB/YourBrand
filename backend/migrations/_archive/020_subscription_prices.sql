-- 020_subscription_prices.sql
-- Initialbefüllung der System-Settings mit den Standard-Abo-Preisen
-- (monatlich, jährlich, lifetime). Überschreibt keine vorhandenen Werte (ON CONFLICT DO NOTHING).
INSERT INTO system_settings (key, value)
VALUES
    ('subscription_price_monthly',  '9.99'),
    ('subscription_price_yearly',   '49.99'),
    ('subscription_price_lifetime', '149.99')
ON CONFLICT (key) DO NOTHING;
