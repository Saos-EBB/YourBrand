-- 027_coin_idempotency_key.sql
-- Idempotency-Key für Coin-Transaktionen: verhindert Doppelabbuchungen bei
-- Retry-Logik (z. B. bei Netzwerkfehlern). Partial-Unique-Index erlaubt NULL.

ALTER TABLE coin_transactions ADD COLUMN idempotency_key VARCHAR(255) NULL;

CREATE UNIQUE INDEX uq_coin_transactions_idempotency_key
    ON coin_transactions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
