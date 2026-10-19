-- 008_premium_codes.sql
-- Shop-Codes wie "premium:30" schalten Premium direkt frei: eine Zeile in
-- subscriptions mit plan 'code' und payment_provider 'shop', ohne Abo bei
-- einem Zahlungsanbieter. provider_subscription_id traegt den
-- Idempotency-Key ("shop-code-<id>"), der Index verhindert doppeltes Freischalten.
--
-- Idempotent wie 002-007. ADD VALUE laeuft ausserhalb einer Transaktion
-- (psql ohne --single-transaction), die neuen Werte werden hier nicht benutzt.

ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'code';
ALTER TYPE public.payment_provider ADD VALUE IF NOT EXISTS 'shop';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_shop_code
    ON public.subscriptions (provider_subscription_id)
    WHERE provider_subscription_id LIKE 'shop-code-%';
