#!/usr/bin/env bash
#
# Mode 3 — endpoint rate test. Stepped rate ramp (same engine as Mode 1's
# login-capacity.sh) against a CHOSEN SUBSET of Mode 2's endpoints (see
# actions.sh) — one, several, or all — instead of one fixed endpoint
# (Mode 1) or NUM_USERS-driven random traffic (Mode 2). User count is
# irrelevant here; only requests/sec against the selected endpoint(s)
# matters, to find exactly which endpoint becomes the bottleneck and at
# what rate.
#
# Needs auth tokens (unlike Mode 1, which tests login itself) — builds its
# own small token pool the same self-sufficient way login-capacity.sh
# builds users.csv, sized by TOKEN_POOL_SIZE (default 500, NOT tied to the
# rate — request identity doesn't matter for finding a bottleneck, tokens
# are reused round-robin across every fired request, same model as
# loadtest.sh's NUM_USERS/10 pool).
#
# This script only does SETUP (endpoint selection, token pool bootstrap,
# log dir creation) — the actual ramp is `exec`'d into rate-gen.js (Node),
# not run here in bash. The original all-bash ramp (fork a curl process
# per request) hit its own ceiling around 200-1500 r/s regardless of
# backend capacity — process-fork overhead itself became the bottleneck
# (see docs/audit.html, 2026-09-13 capacity session). rate-gen.js uses
# keep-alive HTTP connections + async scheduling from a single Node
# process instead, which is what's needed to reach five-figure rates.
#
# Per-request rows are written in the EXACT SAME CSV format loadtest.sh
# uses (timestamp,method,path,status,duration_ms) into this run's
# endpoint-rate-logs/<ts>/ directory, so the dashboard's existing
# aggregator (grouping by path, same 2xx/4xx/5xx categorization) works
# completely unchanged — a per-endpoint breakdown "for free" on top of
# the step-by-step rate table below.
#
# Usage:
#   ./endpoint-rate.sh                                    # all endpoints, default ramp
#   ENDPOINTS=discover_deck ./endpoint-rate.sh             # one endpoint only
#   ENDPOINTS=discover_deck,media_upload START_RATE=10 RATE_STEP=10 STEP_SEC=15 MAX_RATE=100 ./endpoint-rate.sh
#   AUTO_STOP=true SUCCESS_THRESHOLD=95 ./endpoint-rate.sh
#   START_RATE=200 RATE_STEP=200 STEP_SEC=5 MAX_RATE=10000 ./endpoint-rate.sh   # pushing for 10k r/s
#
set -uo pipefail   # bewusst KEIN -e: einzelne fehlgeschlagene Requests
                    # sollen gezaehlt werden, nicht das Script killen

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
source ./actions.sh   # do_request/do_upload/log_error_if_needed/action_*/ACTIONS, BASE_URL default, TEST_PHOTO default

TOKEN_POOL_SIZE="${TOKEN_POOL_SIZE:-500}"
USERS_FILE="${USERS_FILE:-./users.csv}"
TOKENS_FILE="${TOKENS_FILE:-./tokens.csv}"

START_RATE="${START_RATE:-5}"     # Requests/Sekunde in Step 1
RATE_STEP="${RATE_STEP:-5}"       # Steigerung pro Step
STEP_SEC="${STEP_SEC:-10}"        # Dauer eines Steps in Sekunden
MAX_RATE="${MAX_RATE:-2000}"      # Ramp stoppt, sobald target rate das ueberschreitet

AUTO_STOP="${AUTO_STOP:-false}"           # bei true: Ramp stoppt, sobald success% < SUCCESS_THRESHOLD
SUCCESS_THRESHOLD="${SUCCESS_THRESHOLD:-95}"

# ─────────────────────────────────────────────────────────────
# ENDPOINT-AUSWAHL — ENDPOINTS ist eine kommagetrennte Liste von Keys
# (Funktionsname ohne "action_"-Praefix), leer/nicht gesetzt = alle.
# ─────────────────────────────────────────────────────────────

SELECTED_ACTIONS=()
if [ -z "${ENDPOINTS:-}" ]; then
  SELECTED_ACTIONS=("${ACTIONS[@]}")
else
  IFS=',' read -ra KEYS <<< "$ENDPOINTS"
  for key in "${KEYS[@]}"; do
    fn="action_${key}"
    if ! declare -F "$fn" > /dev/null; then
      echo "Fehler: unbekannter Endpoint-Key '${key}'."
      echo "Verfuegbar: $(printf '%s ' "${ACTIONS[@]}" | sed 's/action_//g')"
      exit 1
    fi
    SELECTED_ACTIONS+=("$fn")
  done
fi
ENDPOINT_KEYS="$(printf '%s,' "${SELECTED_ACTIONS[@]}" | sed 's/action_//g; s/,$//')"
echo "Endpoints: ${ENDPOINT_KEYS}"

# ─────────────────────────────────────────────────────────────
# TOKEN-POOL — selbststaendig wie login-capacity.sh's users.csv-Handling:
# vorhandene Dateien bleiben unangetastet, wenn sie schon gross genug sind.
# ─────────────────────────────────────────────────────────────

EXISTING_USERS=0
[ -f "$USERS_FILE" ] && EXISTING_USERS=$(wc -l < "$USERS_FILE")
if [ "$EXISTING_USERS" -lt "$TOKEN_POOL_SIZE" ]; then
  echo "Erzeuge ${USERS_FILE} mit ${TOKEN_POOL_SIZE} Usern (vorhanden: ${EXISTING_USERS})..."
  COUNT="$TOKEN_POOL_SIZE" ./generate-users-csv.sh > "$USERS_FILE"
  echo "Prefetche Tokens..."
  BASE_URL="$BASE_URL" USERS_FILE="$USERS_FILE" TOKENS_FILE="$TOKENS_FILE" ./prefetch-tokens.sh
fi
if [ ! -f "$TOKENS_FILE" ] || [ "$(wc -l < "$TOKENS_FILE" 2>/dev/null || echo 0)" -eq 0 ]; then
  echo "Prefetche Tokens..."
  BASE_URL="$BASE_URL" USERS_FILE="$USERS_FILE" TOKENS_FILE="$TOKENS_FILE" ./prefetch-tokens.sh
fi

AVAILABLE_TOKENS=$(wc -l < "$TOKENS_FILE")
if [ "$AVAILABLE_TOKENS" -eq 0 ]; then
  echo "Fehler: ${TOKENS_FILE} ist leer."
  exit 1
fi

# ─────────────────────────────────────────────────────────────
# SETUP
# ─────────────────────────────────────────────────────────────

TS="$(date +%s)"
LOG_DIR="./endpoint-rate-logs/${TS}"
mkdir -p "${LOG_DIR}"
ERRORS_FILE="${LOG_DIR}/errors.log"   # von rate-gen.js benutzt

echo "Endpoint-Rate-Test gegen ${BASE_URL} (${AVAILABLE_TOKENS} Tokens im Pool, wiederverwendet)"
echo "START_RATE=${START_RATE} RATE_STEP=${RATE_STEP} STEP_SEC=${STEP_SEC} MAX_RATE=${MAX_RATE} AUTO_STOP=${AUTO_STOP}"
echo "Logs: ${LOG_DIR}"
echo ""

# ─────────────────────────────────────────────────────────────
# RAMP — handed off to rate-gen.js (Node). Setup above (endpoint
# selection, token pool, log dir) stays in bash; the actual request
# firing does not, since that's what needed the rewrite. `exec` replaces
# this process image with node (same PID), so dashboard/lib/rateRunner.js
# stopping the process group still works unchanged.
# ─────────────────────────────────────────────────────────────

export BASE_URL LOG_DIR ERRORS_FILE TOKENS_FILE TEST_PHOTO ENDPOINT_KEYS
export START_RATE RATE_STEP STEP_SEC MAX_RATE AUTO_STOP SUCCESS_THRESHOLD

exec node "${SCRIPT_DIR}/rate-gen.js"
