#!/usr/bin/env bash
# Mandanten-Stacks lokal per Docker starten/stoppen (docs/multitenant.md, Schritt 5).
#
#   scripts/tenant.sh up   <slug>|all   Infra sicherstellen, Mandant(en) bauen + starten
#   scripts/tenant.sh down <slug>|all   Mandant(en) stoppen (Daten bleiben in Postgres/MinIO)
#   scripts/tenant.sh ls                Mandanten mit URLs auflisten
#   scripts/tenant.sh logs <slug>       Logs eines Mandanten folgen
#
# Der Mandant "default" ist der Haupt-Stack (docker compose up, Ports 3000/3001)
# und wird hier nicht verwaltet. Pro Mandant legt das Skript beim ersten "up"
# tenants/<slug>/.env an (Ports + eigenes JWT_SECRET, gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

INFRA_SERVICES=(XXX_db redis minio minio-init)

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
  *)    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
