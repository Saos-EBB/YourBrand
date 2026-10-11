#!/usr/bin/env bash
# Shop-Integrationstest gegen echtes Postgres: legt bei jedem Lauf eine frische
# DB yb_shoptest im Container der Shop-Demo an (alle Migrationen), dann laeuft
# backend/src/modules/core/shop/shop.integration.spec.ts mit den echten Services.
# Stripe, Mail, Socket und Queue sind im Test ersetzt — es geht nichts nach aussen.
#
#   scripts/shop_test.sh          (braucht den Demo-Container: scripts/shop_demo.sh up)
#
# Die Demo-Daten (yb_shopdemo) bleiben unberuehrt.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=shop_demo_db
NAME=yb_shoptest
USER_=shopdemo

docker ps --format '{{.Names}}' | grep -qx $DB || { echo "Fehler: $DB laeuft nicht — erst scripts/shop_demo.sh up" >&2; exit 1; }
psql_() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $DB psql -U $USER_ -v ON_ERROR_STOP=1 -q "$@"; }

echo "== Frische Test-DB $NAME"
psql_ -d postgres -c "DROP DATABASE IF EXISTS $NAME WITH (FORCE)" -c "CREATE DATABASE $NAME"
for f in backend/migrations/[0-9][0-9][0-9]_*.sql; do psql_ -d $NAME <"$f" >/dev/null; done

echo "== Integrationstest"
cd backend
SHOP_IT_DB=$NAME DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=$USER_ DB_PASSWORD=shopdemo APP_URL=http://localhost:3901 \
  npx jest src/modules/core/shop/shop.integration --runInBand "$@"
