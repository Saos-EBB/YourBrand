# Bakes the full current schema into /docker-entrypoint-initdb.d/ so a fresh
# volume auto-provisions on first boot. Postgres only runs these on an empty
# data directory — a populated volume (anything short of `docker compose down -v`)
# is left untouched.
#
# migrations/001_baseline.sql is a `pg_dump --schema-only` snapshot of a
# fully-migrated dev database — the single schema source of truth (see
# migrations/001_baseline.sql header). Regenerate it with
# `pg_dump -U $DB_USER -d $DB_NAME --schema-only --no-owner --no-privileges`
# whenever the schema changes.
FROM postgis/postgis:16-3.4

COPY migrations/001_baseline.sql /docker-entrypoint-initdb.d/000_schema.sql
