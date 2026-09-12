# Bakes the full current schema into /docker-entrypoint-initdb.d/ so a fresh
# volume auto-provisions on first boot. Postgres runs everything in that
# directory in filename order, once, only on an empty data directory — a
# populated volume (anything short of `docker compose down -v`) is left
# untouched.
#
# migrations/001_baseline.sql is a `pg_dump --schema-only` snapshot of a
# fully-migrated dev database — the schema source of truth (see
# migrations/001_baseline.sql header). Regenerate it with
# `pg_dump -U $DB_USER -d $DB_NAME --schema-only --no-owner --no-privileges`
# whenever the schema changes.
#
# 002+ are the numbered post-baseline migrations from migrations/ — baked in
# here too so a fresh volume doesn't also need a manual `migration:run`-style
# step to catch up. All idempotent (ON CONFLICT DO NOTHING / IF NOT EXISTS /
# DROP ... IF EXISTS), safe to run again if a new migration re-baselines this
# list later. Copied in ascending order on purpose — that's also the order
# Postgres executes them in.
FROM postgis/postgis:16-3.4

COPY migrations/001_baseline.sql                          /docker-entrypoint-initdb.d/000_schema.sql
COPY migrations/002_seed_system_user.sql                  /docker-entrypoint-initdb.d/002_seed_system_user.sql
COPY migrations/003_track_b_missing_indexes.sql           /docker-entrypoint-initdb.d/003_track_b_missing_indexes.sql
COPY migrations/004_drop_redundant_ban_expiry_trigger.sql /docker-entrypoint-initdb.d/004_drop_redundant_ban_expiry_trigger.sql
