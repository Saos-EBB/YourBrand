-- 009_payment_provider_stripe.sql
-- PaymentService legt nach dem Stripe-Checkout eine Zeile in subscriptions mit
-- payment_provider = 'stripe' an. Das Enum kannte nur paypal/sepa (+ shop aus
-- 008) — der Insert schlug fehl, der Webhook antwortete mit Fehler und der Kauf
-- schaltete kein Premium frei.
--
-- Idempotent wie 002-008. ADD VALUE ohne Nutzung im selben Lauf.

ALTER TYPE public.payment_provider ADD VALUE IF NOT EXISTS 'stripe';
