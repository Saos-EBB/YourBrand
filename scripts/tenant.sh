#!/usr/bin/env bash
# Mandanten-Stacks lokal per Docker starten/stoppen (docs/multitenant.md, Schritt 5).
#
#   scripts/tenant.sh up   <slug>|all   Infra sicherstellen, Mandant(en) bauen + starten
#   scripts/tenant.sh down <slug>|all   Mandant(en) stoppen (Daten bleiben in Postgres/MinIO)
#   scripts/tenant.sh ls                Mandanten mit URLs auflisten
#   scripts/tenant.sh logs <slug>       Logs eines Mandanten folgen
#   scripts/tenant.sh smoke <slug>|all  laufende Mandanten von aussen pruefen
#
# Der Mandant "default" ist der Haupt-Stack (docker compose up, Ports 3000/3001)
# und wird hier nicht verwaltet. Pro Mandant legt das Skript beim ersten "up"
# tenants/<slug>/.env an (Ports + eigenes JWT_SECRET, gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

INFRA_SERVICES=(XXX_db redis minio)

die() { echo "Fehler: $*" >&2; exit 1; }

tenant_slugs() {
  for f in tenants/*/tenant.json; do
    slug=$(basename "$(dirname "$f")")
    [[ "$slug" == _* || "$slug" == default ]] && continue
    echo "$slug"
  done
}

resolve() {
  [[ $# -ge 1 ]] || die "Slug oder 'all' angeben"
  if [[ "$1" == all ]]; then tenant_slugs; return; fi
  [[ "$1" != default ]] || die "'default' ist der Haupt-Stack: docker compose up"
  [[ -f "tenants/$1/tenant.json" ]] || die "tenants/$1/tenant.json fehlt"
  echo "$1"
}

env_value() { grep -E "^$2=" "$1" | cut -d= -f2-; }

# Naechstes freies Portpaar: 3010/3011, 3020/3021, ...
next_port_base() {
  local max=3000 port
  for e in tenants/*/.env; do
    [[ -f "$e" ]] || continue
    port=$(env_value "$e" BACKEND_PORT)
    [[ -n "$port" && "$port" -gt "$max" ]] && max=$port
  done
  echo $(( (max / 10 + 1) * 10 ))
}

# Aus tenants/_template/.env.example: Ports + eigene Secrets pro Mandant.
# Bestehende Dateien bleiben unangetastet (EMAIL_SALT/APP_ENCRYPTION_KEY
# duerfen sich nie aendern, sobald Daten existieren).
ensure_env() {
  local slug=$1 file="tenants/$1/.env" base
  [[ -f "$file" ]] && return
  base=$(next_port_base)
  sed -e "s/__SLUG__/$slug/" \
      -e "s/__BACKEND_PORT__/$base/" \
      -e "s/__FRONTEND_PORT__/$((base + 1))/" \
      -e "s/__JWT_SECRET__/$(openssl rand -hex 32)/" \
      -e "s/__EMAIL_SALT__/$(openssl rand -hex 16)/" \
      -e "s/__APP_ENCRYPTION_KEY__/$(openssl rand -hex 32)/" \
      tenants/_template/.env.example > "$file"
  echo "tenants/$slug/.env angelegt (Ports $base/$((base + 1)), eigene Secrets)"
  echo "  Stripe/Resend-Keys fuer $slug in $file eintragen."
}

compose() {
  local slug=$1; shift
  docker compose -f docker-compose.tenant.yml --env-file .env --env-file "tenants/$slug/.env" "$@"
}

cmd_up() {
  local slugs
  # Erst validieren (resolve laeuft in einer Subshell — "|| exit" beendet
  # dann das Skript), dann Infra starten.
  slugs=$(resolve "$@") || exit 1
  [[ -f .env ]] || die ".env fehlt (cp .env.example .env)"
  echo "== Geteilte Infra"
  docker compose up -d --wait "${INFRA_SERVICES[@]}"
  # minio-init ist ein Einmal-Container (legt den default-Bucket an,
  # exited(0) ist der Erfolgsfall) - "up --wait" wertet ein beendetes
  # Compose-Service als Fehlschlag und wuerde das Skript hier abbrechen,
  # darum separat ohne --wait.
  docker compose up -d minio-init
  for slug in $slugs; do
    echo "== Mandant $slug"
    ensure_env "$slug"
    compose "$slug" up -d --build
  done
  cmd_ls
}

cmd_down() {
  local slugs
  slugs=$(resolve "$@") || exit 1
  for slug in $slugs; do
    [[ -f "tenants/$slug/.env" ]] || continue
    echo "== Mandant $slug"
    compose "$slug" down
  done
}

cmd_ls() {
  printf '%-16s %-9s %-24s %s\n' MANDANT TIER FRONTEND BACKEND
  printf '%-16s %-9s %-24s %s\n' default "$(grep -o '"tier": *"[a-z]*"' tenants/default/tenant.json | grep -o '[a-z]*"$' | tr -d '"')" http://localhost:3001 http://localhost:3000
  for slug in $(tenant_slugs); do
    local tier fe="-" be="-" e="tenants/$slug/.env"
    tier=$(grep -o '"tier": *"[a-z]*"' "tenants/$slug/tenant.json" | grep -o '[a-z]*"$' | tr -d '"')
    if [[ -f "$e" ]]; then
      fe="http://localhost:$(env_value "$e" FRONTEND_PORT)"
      be="http://localhost:$(env_value "$e" BACKEND_PORT)"
    fi
    printf '%-16s %-9s %-24s %s\n' "$slug" "$tier" "$fe" "$be"
  done
}

# Je Modul eine Route, die es nur mit diesem Modul gibt. FeatureGuard laeuft
# vor JwtGuard: ohne Token heisst 404 "Modul aus", 401 "Modul an".
PROBES=(chat:/chat/conversations matching:/discover/deck payments:/payment/subscriptions hidden:/hidden/coin/balance)

json_str() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }

smoke_one() {
  local slug=$1 e="tenants/$1/.env" fail=0 api fe tenant seed users owner token code brand title
  check() {
    if [[ "$2" == "$3" ]]; then echo "  ok    $1"; else echo "  FEHLER $1 — erwartet '$3', bekommen '$2'"; fail=1; fi
  }
  echo "== $slug"
  [[ -f "$e" ]] || { echo "  FEHLER nicht gestartet (tenants/$slug/.env fehlt)"; return 1; }
  api="http://localhost:$(env_value "$e" BACKEND_PORT)/api/v1"
  fe="http://localhost:$(env_value "$e" FRONTEND_PORT)"

  tenant=$(curl -s --max-time 10 "$api/tenant" || true)
  check "GET /tenant" "$(json_str slug <<<"$tenant")" "$slug"

  # Owner aus dem Demo-Datensatz (Seed) — prueft Seeds + Mandanten-Secrets.
  # Ohne eigenes "seed" (alle Showcase-Mandanten teilen sich bewusst einen
  # Datensatz, siehe tenants/README.md) gilt der mitgelieferte Default-Seed.
  seed=$(grep -o '"seed": *"[^"]*"' "tenants/$slug/tenant.json" | cut -d'"' -f4)
  if [[ -n "$seed" ]]; then
    users="tenants/$seed/seed/demo-users.yaml"
  else
    users="backend/src/database/seeds/demo-users.yaml"
  fi
  if [[ -f "$users" ]]; then
    owner=$(grep -B3 '^  role: owner' "$users" | grep -o 'email: .*' | cut -d' ' -f2)
    token=$(curl -s --max-time 10 -X POST "$api/auth/login" -H 'Content-Type: application/json' \
      -d "{\"identifier\":\"$owner\",\"password\":\"Demo1234!\"}" | json_str accessToken)
    check "Owner-Login $owner" "$([[ -n "$token" ]] && echo ok || echo kein-token)" ok
  fi

  for probe in "${PROBES[@]}"; do
    local module=${probe%%:*} route=${probe#*:} enabled
    enabled=$(grep -o "\"$module\":\(true\|false\)" <<<"$tenant" | cut -d: -f2)
    code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "$api$route")
    if [[ "$enabled" == true ]]; then
      check "Modul $module an  ($route)" "$([[ "$code" == 401 ]] && echo erreichbar || echo "$code")" erreichbar
    else
      check "Modul $module aus ($route)" "$code" 404
    fi
  done

  brand=$(json_str name <<<"$tenant")
  title=$(curl -s --max-time 120 "$fe/login" | grep -o '<title>[^<]*</title>' | sed -E 's#</?title>##g')
  check "Frontend-Titel" "$title" "$brand"
  return $fail
}

cmd_smoke() {
  local slugs failed=0
  slugs=$(resolve "$@") || exit 1
  for slug in $slugs; do smoke_one "$slug" || failed=1; done
  [[ $failed == 0 ]] && echo "Alle Checks ok." || echo "Es gab Fehler."
  return $failed
}

cmd_logs() {
  local slug
  slug=$(resolve "$@") || exit 1
  [[ "$slug" != *$'\n'* ]] || die "logs nur fuer einen Mandanten"
  compose "$slug" logs -f
}

case "${1:-}" in
  up)   shift; cmd_up "$@" ;;
  down) shift; cmd_down "$@" ;;
  ls)   cmd_ls ;;
  logs) shift; cmd_logs "$@" ;;
  smoke) shift; cmd_smoke "$@" ;;
  *)    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
