#!/usr/bin/env bash
# Ein Befehl fuer die komplette Demo: YourBrand (der default-Mandant, Haupt-
# Stack aus docker-compose.yml) + alle Mandanten aus tenants/ (scripts/tenant.sh),
# auf derselben geteilten Infra (Postgres/Redis/MinIO, Netz yb_network).
#
#   scripts/demo.sh up     Env-Dateien anlegen (falls noetig), alles bauen + starten,
#                          danach die Mandanten-Console (http://localhost:3099)
#   scripts/demo.sh down   Alles stoppen inkl. Console (Daten bleiben in Postgres/MinIO)
#   scripts/demo.sh ls     Alle laufenden Stacks mit URLs (default + Mandanten + Console)
#
# .env / backend/.env / frontend/.env werden beim ersten "up" aus den
# *.env.example-Vorlagen generiert (gitignored, eigene Secrets) — danach
# idempotent, bestehende Dateien bleiben unangetastet (siehe ensure_root_env's
# Hinweis zu APP_ENCRYPTION_KEY/EMAIL_SALT in ensure_backend_env).
set -euo pipefail
cd "$(dirname "$0")/.."

env_value() { grep -E "^$2=" "$1" | cut -d= -f2-; }

# DB_NAME/DB_USER/DB_PASSWORD/JWT_SECRET/MINIO_ROOT_* muessen mit backend/.env
# uebereinstimmen (siehe .env.example-Kommentar) — hier einmal generiert, dort
# zurueckgelesen.
ensure_root_env() {
  [[ -f .env ]] && return
  cat > .env <<EOF
DB_NAME=yourbrand
DB_USER=yourbrand
DB_PASSWORD=$(openssl rand -hex 16)
PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
CORS_ORIGIN=http://localhost:3001
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)
BACKEND_URL=http://localhost:3000
TENANT=default
EOF
  echo ".env angelegt (DB/MinIO/pgAdmin-Zugangsdaten + JWT_SECRET generiert)"
}

# EMAIL_SALT/APP_ENCRYPTION_KEY werden nur hier generiert (nicht in .env) —
# docker-compose.yml setzt sie nicht per environment:, das Backend liest sie
# nur aus dieser Datei (ueber den ./backend:/app-Bind-Mount). Stripe/Resend
# bleiben Demo-Platzhalter: die Seeds rufen keine echten APIs auf.
ensure_backend_env() {
  [[ -f backend/.env ]] && return
  [[ -f .env ]] || die ".env fehlt (ensure_root_env zuerst)"
  local db_name db_user db_password jwt_secret minio_user minio_password pgadmin_password
  db_name=$(env_value .env DB_NAME)
  db_user=$(env_value .env DB_USER)
  db_password=$(env_value .env DB_PASSWORD)
  jwt_secret=$(env_value .env JWT_SECRET)
  minio_user=$(env_value .env MINIO_ROOT_USER)
  minio_password=$(env_value .env MINIO_ROOT_PASSWORD)
  pgadmin_password=$(env_value .env PGADMIN_PASSWORD)
  cat > backend/.env <<EOF
DB_NAME=$db_name
DB_USER=$db_user
DB_PASSWORD=$db_password

REDIS_HOST=localhost
REDIS_PORT=6379

MINIO_ROOT_USER=$minio_user
MINIO_ROOT_PASSWORD=$minio_password
S3_ENDPOINT=http://localhost:9000
S3_REGION=auto
S3_ACCESS_KEY_ID=$minio_user
S3_SECRET_ACCESS_KEY=$minio_password
S3_BUCKET=yourbrand-media
S3_PUBLIC_URL_BASE=http://localhost:3000/api/v1/media/file

PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=$pgadmin_password

JWT_SECRET=$jwt_secret
EMAIL_SALT=$(openssl rand -hex 16)

RESEND_API_KEY=re_demo_not_used

APP_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001

APP_ENCRYPTION_KEY=$(openssl rand -hex 32)

STRIPE_PUBLISHABLE_KEY=pk_test_demo_not_used
STRIPE_SECRET_KEY=sk_test_demo_not_used
STRIPE_WEBHOOK_SECRET=whsec_demo_not_used
STRIPE_SUCCESS_URL=http://localhost:3001/payment/success
STRIPE_CANCEL_URL=http://localhost:3001/payment/cancel

LOADTEST_MODE=false
SEED_RESET=true

COOKIE_SAMESITE=lax
NODE_ENV=development
DEMO_MEDIA_PATH=
TENANT=default
EOF
  echo "backend/.env angelegt (DB/JWT/MinIO wie .env, eigenes EMAIL_SALT/APP_ENCRYPTION_KEY generiert)"
}

ensure_frontend_env() {
  [[ -f frontend/.env ]] && return
  cp frontend/.env.example frontend/.env
  echo "frontend/.env angelegt (Defaults aus frontend/.env.example)"
}

die() { echo "Fehler: $*" >&2; exit 1; }

# Die Console (backend/src/console/) laeuft auf dem Host, nicht im Container —
# sie braucht git und docker. Hintergrundprozess, PID/Log in .console/ (gitignored).
CONSOLE_PID=.console/console.pid
CONSOLE_LOG=.console/console.log

console_running() { [[ -f $CONSOLE_PID ]] && kill -0 "$(cat "$CONSOLE_PID")" 2>/dev/null; }

start_console() {
  if console_running; then
    echo "Console laeuft bereits: http://localhost:3099"
    return
  fi
  if [[ ! -x backend/node_modules/.bin/ts-node ]]; then
    echo "Console nicht gestartet: backend/node_modules fehlt auf dem Host (einmalig: cd backend && npm ci)" >&2
    return
  fi
  mkdir -p .console
  (cd backend && exec setsid nohup npm run console >"../$CONSOLE_LOG" 2>&1) &
  echo $! >"$CONSOLE_PID"
  echo "Console gestartet: http://localhost:3099 (Log: $CONSOLE_LOG)"
}

stop_console() {
  if console_running; then
    # setsid -> eigene Prozessgruppe, so wird npm samt ts-node beendet
    kill -- -"$(cat "$CONSOLE_PID")" 2>/dev/null || kill "$(cat "$CONSOLE_PID")"
    echo "Console gestoppt"
  fi
  rm -f "$CONSOLE_PID"
}

cmd_up() {
  ensure_root_env
  ensure_backend_env
  ensure_frontend_env
  echo "== YourBrand (default) + geteilte Infra"
  docker compose up -d --build
  echo "== Mandanten"
  scripts/tenant.sh up all
  echo "== Mandanten-Console"
  start_console
}

cmd_down() {
  stop_console
  scripts/tenant.sh down all
  docker compose down
}

case "${1:-}" in
  up)   cmd_up ;;
  down) cmd_down ;;
  ls)   scripts/tenant.sh ls
        if console_running; then echo "console  http://localhost:3099"; else echo "console  aus"; fi ;;
  *)    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
