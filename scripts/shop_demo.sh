#!/usr/bin/env bash
# Shop-Demo zum Ausprobieren, ohne Login: eigener kleiner Stack neben allem
# anderen (eigene Ports, eigene Container, eigenes Volume — der Haupt-Stack
# und die Mandanten bleiben unberuehrt).
#
#   scripts/shop_demo.sh up     bauen/starten, danach http://localhost:3901/shop
#                               (eingeloggt als Demo-Admin, Admin-Konsole: /admin/shop)
#   scripts/shop_demo.sh down   alles stoppen (Daten bleiben im Volume)
#
# Ein zweites "up" ist harmlos: fehlende Migrationen werden nachgezogen,
# Seeds ueberspringen Vorhandenes. Nach einem Neustart des Rechners laufen
# DB/Redis/Frontend von selbst wieder an, Backend + Proxy brauchen ein "up".
# Frisch anfangen: down, dann docker rm shop_demo_db und docker volume rm shop_demo_pgdata.
#
# Ports: 3901 Shop (Proxy mit Auto-Login) · 3911 Frontend · 3900 Backend (+ Worker ohne Port)
#        55432 Postgres · 56379 Redis. Zustand/Logs: .shop-demo/ (gitignored).
# Stripe ist nicht angebunden (Platzhalter-Key): Kasse und "Annehmen" zeigen
# den Fehlerweg; die Testbestellungen sind deshalb direkt angenommen.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
STATE=$ROOT/.shop-demo
SLUG=shopdemo
DB_NAME=yb_$SLUG
DB_USER=shopdemo
DB_PASSWORD=shopdemo
DEMO_USER=gutz   # Admin aus demo-users.yaml — mit ihm ist man automatisch eingeloggt

DB=shop_demo_db
REDIS=shop_demo_redis
FE=shop_demo_fe

die() { echo "Fehler: $*" >&2; exit 1; }
running() { [[ -f $1 ]] && kill -0 "$(cat "$1")" 2>/dev/null; }

# Einstellungen wie im Haupt-Stack (JWT, Verschluesselung, Stripe-Platzhalter)
# aus backend/.env, nur DB/Redis/Ports zeigen auf diesen Stack
backend_env() {
  echo "PORT=3900 TENANT=$SLUG TENANT_DIR=$STATE/tenants DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD" \
       "REDIS_HOST=127.0.0.1 REDIS_PORT=56379 CORS_ORIGIN=http://localhost:3901 APP_URL=http://localhost:3901" \
       "BACKEND_URL=http://localhost:3900 SEED_RESET=false DEMO_MEDIA_PATH="
}
in_backend() { (cd backend && env $(backend_env) TS_NODE_TRANSPILE_ONLY=1 "$@"); }
ts() { in_backend npx ts-node -r tsconfig-paths/register "$@"; }

ensure_prereqs() {
  [[ -f backend/.env ]] || die "backend/.env fehlt — einmal scripts/demo.sh up oder aus backend/.env.example anlegen"
  [[ -x backend/node_modules/.bin/ts-node ]] || die "backend/node_modules fehlt auf dem Host (einmalig: cd backend && npm ci)"
  mkdir -p "$STATE/tenants/$SLUG"
  cp scripts/shop-demo/tenant.json "$STATE/tenants/$SLUG/tenant.json"
  cp tenants/default/logo.svg tenants/default/favicon.png "$STATE/tenants/$SLUG/"
}

# Geaenderte Einstellungen (Ports, Env) erkennt das Label: dann neu anlegen,
# Daten bleiben in den Volumes
start_container() {
  local name=$1; shift
  local cfg; cfg=$(printf '%s\n' "$@" | sha1sum | cut -c1-12)
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    if [[ $(docker inspect -f '{{index .Config.Labels "shopdemo.cfg"}}' "$name") != "$cfg" ]]; then
      echo "   $name: Einstellungen geaendert, neu anlegen"
      docker rm -f "$name" >/dev/null
    else
      docker start "$name" >/dev/null
      return
    fi
  fi
  docker run -d --name "$name" --restart unless-stopped --label "shopdemo.cfg=$cfg" "$@" >/dev/null
}

start_infra() {
  echo "== Postgres + Redis"
  start_container $DB -p 127.0.0.1:55432:5432 -v shop_demo_pgdata:/var/lib/postgresql/data \
    -e POSTGRES_USER=$DB_USER -e POSTGRES_PASSWORD=$DB_PASSWORD postgis/postgis:16-3.4
  start_container $REDIS -p 127.0.0.1:56379:6379 redis:7-alpine
  # ueber TCP pruefen: beim ersten Start laeuft erst ein Init-Server nur auf dem Socket
  local ok=
  for _ in $(seq 60); do docker exec $DB pg_isready -h 127.0.0.1 -U $DB_USER -q && { ok=1; break; }; sleep 1; done
  [[ -n $ok ]] || die "Postgres startet nicht (docker logs $DB)"
  # DB selbst anlegen wie tenant-init.ts: POSTGRES_DB bekaeme vom postgis-Image
  # schon die Extensions, die auch in der Baseline stehen
  if [[ -z $(docker exec $DB psql -U $DB_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'") ]]; then
    docker exec $DB psql -U $DB_USER -d postgres -qc "CREATE DATABASE $DB_NAME"
  fi
}

psql_q() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $DB psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -q "$@"; }

# Wie tenant-init.ts: Baseline + NNN_*.sql in Reihenfolge, Eingespieltes merkt
# sich shop_demo_migrations — neue Migrationen kommen beim naechsten "up" dazu
migrate() {
  echo "== Migrationen"
  psql_q -c "CREATE TABLE IF NOT EXISTS shop_demo_migrations (file text PRIMARY KEY, applied_at timestamptz DEFAULT now())"
  for f in backend/migrations/[0-9][0-9][0-9]_*.sql; do
    local file; file=$(basename "$f")
    [[ -n $(psql_q -tAc "SELECT 1 FROM shop_demo_migrations WHERE file = '$file'") ]] && continue
    echo "   $file"
    psql_q < "$f" >/dev/null
    psql_q -c "INSERT INTO shop_demo_migrations (file) VALUES ('$file')"
  done
}

seed() {
  echo "== Seeds (Demo-User, 1000 Artikel, Testbestellungen)"
  ts src/database/seeds/demo-seed.ts | tail -n 2
  ts src/database/seeds/seed-shop.ts | tail -n 1
  in_backend env SHOP_DEMO_DB=$DB_NAME SHOP_DEMO_USER=$DEMO_USER TS_NODE_PROJECT="$ROOT/backend/tsconfig.json" \
    NODE_PATH="$ROOT/backend/node_modules" npx ts-node -r tsconfig-paths/register "$ROOT/scripts/shop-demo/seed-orders.ts"
}

start_backend() {
  echo "== Backend :3900"
  if running "$STATE/backend.pid"; then echo "   laeuft schon"; return; fi
  (cd backend && exec setsid nohup env $(backend_env) TS_NODE_TRANSPILE_ONLY=1 \
    npx ts-node -r tsconfig-paths/register src/main.ts >"$STATE/backend.log" 2>&1) &
  echo $! >"$STATE/backend.pid"
  for _ in $(seq 90); do
    curl -s -o /dev/null http://127.0.0.1:3900/api/v1/shop/settings && return
    running "$STATE/backend.pid" || die "Backend abgestuerzt — $STATE/backend.log"
    sleep 1
  done
  die "Backend antwortet nicht — $STATE/backend.log"
}

# Worker: Rechnungen (BullMQ), wie im Haupt-Stack ein eigener Prozess
start_worker() {
  echo "== Worker (Rechnungen)"
  if running "$STATE/worker.pid"; then echo "   laeuft schon"; return; fi
  (cd backend && exec setsid nohup env $(backend_env) TS_NODE_TRANSPILE_ONLY=1 \
    npx ts-node -r tsconfig-paths/register src/worker.ts >"$STATE/worker.log" 2>&1) &
  echo $! >"$STATE/worker.pid"
  sleep 3
  running "$STATE/worker.pid" || die "Worker abgestuerzt — $STATE/worker.log"
}

# node_modules und .next in eigenen Volumes: der Bind-Mount von frontend/
# bleibt sauber, der Haupt-Stack teilt nichts mit diesem Container
start_frontend() {
  echo "== Frontend :3911 (erster Start installiert Pakete, dauert)"
  local pk; pk=$(grep -E '^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=' frontend/.env 2>/dev/null | cut -d= -f2- || true)
  start_container $FE --network host -v "$ROOT/frontend:/app" -v shop_demo_fe_modules:/app/node_modules \
    -v shop_demo_fe_next:/app/.next -w /app \
    -e NEXT_PUBLIC_API_URL=http://localhost:3900/api/v1 -e BACKEND_INTERNAL_URL=http://localhost:3900 \
    -e NEXT_PUBLIC_WS_URL=http://localhost:3900 \
    -e NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${pk:-pk_test_demo_not_used}" \
    node:20-alpine sh -c '[ -x node_modules/.bin/next ] || npm ci; exec npx next dev -p 3911'
}

# Login des Demo-Admins als {accessToken, user} wie authStore ihn speichert, 30 Tage gueltig
write_auth() {
  local row; row=$(psql_q -tAc "SELECT u.id || '|' || u.role FROM users u JOIN profiles p ON p.user_id = u.id WHERE p.nickname = '$DEMO_USER'")
  [[ -n $row ]] || die "Demo-User $DEMO_USER fehlt"
  (cd backend && node -e '
    require("dotenv").config({ quiet: true });
    const jwt = require("jsonwebtoken");
    const [id, role] = process.argv[1].split("|");
    const accessToken = jwt.sign({ sub: id, role }, process.env.JWT_SECRET, { expiresIn: "30d" });
    process.stdout.write(JSON.stringify({ accessToken, user: { id, role, email: "", onboardingCompleted: true } }));
  ' "$row") >"$STATE/auth.json"
}

start_proxy() {
  echo "== Shop mit Auto-Login :3901"
  if running "$STATE/proxy.pid"; then kill "$(cat "$STATE/proxy.pid")"; fi
  setsid nohup node scripts/shop-demo/autologin-proxy.js 3901 3911 "$STATE/auth.json" >"$STATE/proxy.log" 2>&1 &
  echo $! >"$STATE/proxy.pid"
}

stop_pid() {
  if running "$1"; then kill -- -"$(cat "$1")" 2>/dev/null || kill "$(cat "$1")"; echo "   $2 gestoppt"; fi
  rm -f "$1"
}

cmd_up() {
  ensure_prereqs
  start_infra
  migrate
  seed
  start_backend
  start_worker
  start_frontend
  write_auth
  start_proxy
  echo
  echo "Fertig: http://localhost:3901/shop  (eingeloggt als $DEMO_USER, Admin: /admin/shop)"
  echo "        Frontend braucht beim ersten Aufruf etwas: docker logs -f $FE"
}

cmd_down() {
  stop_pid "$STATE/proxy.pid" Proxy
  stop_pid "$STATE/backend.pid" Backend
  stop_pid "$STATE/worker.pid" Worker
  docker stop $FE $REDIS $DB >/dev/null 2>&1 || true
  echo "   Container gestoppt (Daten bleiben in shop_demo_pgdata)"
}

case "${1:-}" in
  up)   cmd_up ;;
  down) cmd_down ;;
  *)    sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
