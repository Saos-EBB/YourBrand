#!/usr/bin/env bash
#
# Sweep ueber mehrere DB_POOL_MAX-Werte: startet XXX_backend_load fuer jeden
# Wert neu (reiner Env-Var-Override, kein Image-Rebuild noetig — siehe
# database.config.ts:14, "poolMax: Number(process.env.DB_POOL_MAX) || 10")
# und faehrt denselben Endpoint-Rate-Ramp (Mode 3, endpoint-rate.sh) mit
# AUTO_STOP=true dagegen. endpoint-rate.sh bricht selbst ab, sobald success%
# (nur echte 5xx/000-Fehler, siehe dessen aggregate_step_csv) unter
# SUCCESS_THRESHOLD faellt — kein eigener Knick-Algorithmus noetig hier, die
# letzte Zeile VOR dem Abbruch ist die gefundene Kapazitaetsgrenze fuer
# diesen Pool-Wert.
#
# Grund fuer den Sweep statt live anzupassen: DB_POOL_MAX wird nur beim
# Prozessstart gelesen. Ein Recreate mitten in einem laufenden Ramp wuerde
# jede offene Verbindung killen und genau die Messung verfaelschen, die der
# Ramp eigentlich liefern soll (den Knick bei EINER festen Konfiguration).
# Stattdessen: derselbe Ramp mehrfach, je mit fester Poolgroesse, danach
# die gefundenen Grenzen nebeneinander vergleichen.
#
# Usage:
#   POOL_VALUES="10 20 50 100" ./pool-sweep.sh
#   POOL_VALUES="20 50" SUCCESS_THRESHOLD=90 START_RATE=200 MAX_RATE=400 ./pool-sweep.sh
#   (ohne ENV: POOL_VALUES="10 20 50", SUCCESS_THRESHOLD=95, MAX_RATE=500 —
#   MAX_RATE bewusst niedriger als endpoint-rate.sh's eigener Default 2000,
#   sonst laeuft ein Pool-Wert, der nie bricht, praktisch endlos)
#
# Alle anderen Ramp-Parameter (START_RATE, RATE_STEP, STEP_SEC, ENDPOINTS,
# BASE_URL, TOKEN_POOL_SIZE) werden 1:1 an endpoint-rate.sh durchgereicht —
# siehe dessen eigenen Header-Kommentar fuer deren Bedeutung/Defaults.
#
# Voraussetzung: Loadtest-Stack (DB/Redis/MinIO) laeuft bereits — nur
# XXX_backend_load wird hier pro Sweep-Schritt neu gestartet, siehe
# README.md fuer den vollen Start-Befehl.
#
set -uo pipefail   # bewusst KEIN -e, siehe run-loadtest.sh — ein
                   # fehlgeschlagener Pool-Wert soll den restlichen Sweep
                   # nicht abwuergen

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

POOL_VALUES="${POOL_VALUES:-10 20 50}"
SUCCESS_THRESHOLD="${SUCCESS_THRESHOLD:-95}"
MAX_RATE="${MAX_RATE:-500}"
BASE_URL="${BASE_URL:-http://localhost:3100/api/v1}"
export SUCCESS_THRESHOLD MAX_RATE BASE_URL
export AUTO_STOP=true

COMPOSE_ARGS=(compose -f docker-compose.yml -f docker-compose.loadtest.yml)
SERVICE=XXX_backend_load

LOG_DIR="pool-sweep-logs"
mkdir -p "$LOG_DIR"
TS=$(date +%s)
SWEEP_LOG="${LOG_DIR}/${TS}.log"

log() { echo "$@" | tee -a "$SWEEP_LOG"; }

recreate_backend() {
  local pool="$1"
  log "--- Recreate ${SERVICE} mit DB_POOL_MAX=${pool} ..."
  ( cd "$REPO_ROOT" && DB_POOL_MAX="$pool" docker "${COMPOSE_ARGS[@]}" up -d --force-recreate "$SERVICE" ) >> "$SWEEP_LOG" 2>&1
}

# Gleiche zwei Pruefungen wie run-loadtest.sh Schritt 1+2: erst der
# Health-Endpoint (Prozess laeuft, routet — bewusst ohne DB-Zugriff, siehe
# app.service.ts), dann ein echter Login-Versuch, weil ein 200 vom
# Health-Endpoint allein noch nicht beweist dass DB/Auth-Pipeline schon
# einsatzbereit sind.
wait_for_backend_ready() {
  local tries=30
  while [ "$tries" -gt 0 ]; do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "$BASE_URL" 2>/dev/null)
    [ "$status" = "200" ] && break
    tries=$((tries - 1))
    sleep 1
  done
  [ "$tries" -eq 0 ] && return 1

  tries=15
  while [ "$tries" -gt 0 ]; do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" -m 5 -X POST "${BASE_URL}/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"identifier":"seed_user_0001@seed.local","password":"SeedUser1234!"}' 2>/dev/null)
    [ "$status" = "200" ] && return 0
    tries=$((tries - 1))
    sleep 1
  done
  return 1
}

RESULTS_FILE=$(mktemp)
trap 'rm -f "$RESULTS_FILE"' EXIT

for pool in $POOL_VALUES; do
  recreate_backend "$pool"
  log "Warte auf einsatzbereites Backend..."
  if ! wait_for_backend_ready; then
    log "Fehler: Backend nach Recreate nicht einsatzbereit (DB_POOL_MAX=${pool}) — ueberspringe."
    printf '%s\tFEHLER\t-\t-\t-\n' "$pool" >> "$RESULTS_FILE"
    continue
  fi

  # Frischer Token-Pool pro Sweep-Schritt — ueber einen laengeren Sweep
  # hinweg koennten sonst die Access-Tokens der ersten Iteration (15 Min
  # Laufzeit) in einer spaeteren Iteration ablaufen. Ein abgelaufener Token
  # gibt 401 zurueck, zaehlt aber als 4xx = erwarteter Traffic (siehe
  # endpoint-rate.sh's aggregate_step_csv) und wuerde AUTO_STOP NICHT
  # ausloesen — das Sweep-Ergebnis waere dann still falsch. users.csv
  # bleibt (die Accounts existieren schon), nur die Tokens werden neu geholt.
  rm -f tokens.csv

  log ""
  log "=== Rate-Ramp mit DB_POOL_MAX=${pool} ==="
  output=$(./endpoint-rate.sh 2>&1)
  echo "$output" >> "$SWEEP_LOG"
  echo "$output"

  # endpoint-rate.sh druckt die Stufen-Tabelle am Ende NOCHMAL komplett in
  # summary.txt/stdout ("Fertig. Aggregiere Ergebnisse..." markiert den
  # Schnitt) — nur der Teil davor zaehlen, sonst wird jede Zeile doppelt
  # erkannt.
  live_output=$(printf '%s\n' "$output" | sed '/^Fertig\. Aggregiere Ergebnisse/,$d')
  rows=$(printf '%s\n' "$live_output" | grep -E '^[0-9]+[[:space:]]+[0-9]+/s')

  if [ -z "$rows" ]; then
    log "Fehler: keine Ramp-Zeile von endpoint-rate.sh erhalten (DB_POOL_MAX=${pool}) — vermutlich Prefetch/Setup fehlgeschlagen."
    printf '%s\tFEHLER\t-\t-\t-\n' "$pool" >> "$RESULTS_FILE"
  elif printf '%s\n' "$live_output" | grep -q '^AUTO_STOP:'; then
    good_row=$(printf '%s\n' "$rows" | tail -2 | head -1)
    bad_row=$(printf '%s\n' "$rows" | tail -1)
    ceiling=$(printf '%s' "$good_row" | awk '{print $2}')
    avg_ms=$(printf '%s' "$good_row" | awk '{print $6}')
    p95_ms=$(printf '%s' "$good_row" | awk '{print $7}')
    breaks_at=$(printf '%s' "$bad_row" | awk '{print $2}')
    printf '%s\t%s\t%s\t%s\tbricht bei %s\n' "$pool" "$ceiling" "$avg_ms" "$p95_ms" "$breaks_at" >> "$RESULTS_FILE"
  else
    last_row=$(printf '%s\n' "$rows" | tail -1)
    ceiling=$(printf '%s' "$last_row" | awk '{print $2}')
    avg_ms=$(printf '%s' "$last_row" | awk '{print $6}')
    p95_ms=$(printf '%s' "$last_row" | awk '{print $7}')
    printf '%s\t>=%s\t%s\t%s\tMAX_RATE erreicht, kein Bruch\n' "$pool" "$ceiling" "$avg_ms" "$p95_ms" >> "$RESULTS_FILE"
  fi
done

log ""
log "=== Sweep-Ergebnis (Logs: ${SWEEP_LOG}) ==="
{
  printf '%-12s %-14s %-8s %-8s %-30s\n' "DB_POOL_MAX" "Grenze" "avg_ms" "p95_ms" "Hinweis"
  while IFS=$'\t' read -r pool ceiling avg p95 note; do
    printf '%-12s %-14s %-8s %-8s %-30s\n' "$pool" "$ceiling" "$avg" "$p95" "$note"
  done < "$RESULTS_FILE"
} | tee -a "$SWEEP_LOG"

log ""
log "Backend laeuft jetzt mit dem zuletzt getesteten DB_POOL_MAX=${pool}. Zuruecksetzen:"
log "  docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d --force-recreate ${SERVICE}"
