-- 003_track_b_missing_indexes.sql
-- Track B (correctness/maintainability backlog, docs/architecture.md): five
-- foreign-key-shaped lookup columns had no index, forcing a sequential scan
-- on every read of these tables. CONCURRENTLY so this doesn't take a
-- write-blocking lock on tables that may already be live; each statement
-- must therefore run outside a transaction block (default psql autocommit
-- behavior — do not wrap this file in BEGIN/COMMIT).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beef_votes_beef_id
    ON public.beef_votes (beef_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beef_comments_beef_id
    ON public.beef_comments (beef_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coin_transactions_user_id
    ON public.coin_transactions (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teeth_owner_id
    ON public.teeth (owner_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_badges_expires_at
    ON public.badges (expires_at);
