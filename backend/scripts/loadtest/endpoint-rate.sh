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
#
set -uo pipefail   # bewusst KEIN -e: einzelne fehlgeschlagene Requests
                    # sollen gezaehlt werden, nicht das Script killen

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
source ./actions.sh   # do_request/do_upload/log_error_if_needed/action_*/ACTIONS, BASE_URL default

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

mapfile -t TOKEN_LINES < "$TOKENS_FILE"
AVAILABLE_TOKENS="${#TOKEN_LINES[@]}"
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
ERRORS_FILE="${LOG_DIR}/errors.log"   # von log_error_if_needed (actions.sh) benutzt

echo "Endpoint-Rate-Test gegen ${BASE_URL} (${AVAILABLE_TOKENS} Tokens im Pool, wiederverwendet)"
echo "START_RATE=${START_RATE} RATE_STEP=${RATE_STEP} STEP_SEC=${STEP_SEC} MAX_RATE=${MAX_RATE} AUTO_STOP=${AUTO_STOP}"
echo "Logs: ${LOG_DIR}"
echo ""

# Aggregiert eine Step-CSV-Datei (gleiches Format wie loadtest.sh) zu
# attempts/successes/avg/p95/max. success = "kein echter Fehler", nicht
# "2xx" — gleiche Definition wie actions.sh's log_error_if_needed() und
# des Dashboards aggregator.js categorizeStatus(): nur 5xx und eine tote
# Verbindung ("000") sind echte Fehler. Ein 4xx ist bei diesem Lastansatz
# erwarteter Traffic (doppelte Anfrage, zu wenig Coins, Admin-Endpoint von
# einem Nicht-Owner-Token, ...) und darf success%/AUTO_STOP nicht
# verfaelschen — siehe auch actions.sh's eigener Kommentar dazu. Absichtlich
# NICHT dieselbe Funktion wie login-capacity.sh's aggregate_step (die liest
# pro-Request-Dateien, hier ist alles schon in einer gemeinsamen Step-CSV).
aggregate_step_csv() {
  local file="$1"
  awk -F',' '
    NR>1 {
      n++
      if ($4 == "000" || ($4 ~ /^[0-9]+$/ && $4+0 >= 500)) { err++ }
      else { ok++; sum+=$5; dur[ok_n++]=$5; if ($5>max) max=$5 }
    }
    END {
      printf "%d\t%d\n", n+0, ok+0
      if (ok_n > 0) {
        n_sorted = asort(dur)
        p95idx = int(n_sorted*0.95); if (p95idx>=n_sorted) p95idx=n_sorted-1
        printf "%.0f\t%d\t%d\n", sum/ok_n, dur[p95idx+1], max
      } else {
        printf "0\t0\t0\n"
      }
    }' "$file"
}

# Feuert EINEN Request: zufaellig gewaehlte Aktion aus der Auswahl, Token
# per Round-Robin aus dem Pool. Mehrere fire_one laufen parallel (siehe
# Haupt-Loop) und haengen alle an dieselbe Step-CSV an — auf Linux ist ein
# einzelner append-Write < PIPE_BUF (4096 Bytes) atomar, eine CSV-Zeile
# bleibt also unter gleichzeitigen Schreibern unbeschaedigt.
fire_one() {
  local logfile="$1" token_idx="$2"
  local email token
  IFS=',' read -r email token <<< "${TOKEN_LINES[$token_idx]}"
  local action="${SELECTED_ACTIONS[$((RANDOM % ${#SELECTED_ACTIONS[@]}))]}"
  "$action" "$logfile" "$token"
}

printf '%-6s %-12s %-10s %-10s %-10s %-8s %-8s %-8s\n' \
  "step" "target/s" "attempts" "success" "success%" "avg_ms" "p95_ms" "max_ms"

TOKEN_CURSOR=0
RESULTS=()
STEP_NUM=0
RATE="$START_RATE"

while [ "$RATE" -le "$MAX_RATE" ]; do
  STEP_NUM=$((STEP_NUM + 1))
  STEP_LOGFILE="${LOG_DIR}/step_${STEP_NUM}.csv"
  echo "timestamp,method,path,status,duration_ms" > "$STEP_LOGFILE"

  PIDS=()
  for (( sec=0; sec<STEP_SEC; sec++ )); do
    tick_start=$(date +%s%3N)
    for (( r=0; r<RATE; r++ )); do
      TOKEN_CURSOR=$((TOKEN_CURSOR + 1))
      token_idx=$(( TOKEN_CURSOR % AVAILABLE_TOKENS ))
      fire_one "$STEP_LOGFILE" "$token_idx" &
      PIDS+=($!)
    done
    tick_end=$(date +%s%3N)
    elapsed=$(( tick_end - tick_start ))
    remaining=$(( 1000 - elapsed ))
    if [ "$remaining" -gt 0 ]; then
      sleep "$(awk -v ms="$remaining" 'BEGIN{printf "%.3f", ms/1000}')"
    fi
  done

  # Step-Dauer ist um, aber einzelne Requests koennen laenger brauchen
  # (das ist ja genau das, was wir hier messen wollen) — auf alle warten.
  for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null; done

  mapfile -t stat_lines < <(aggregate_step_csv "$STEP_LOGFILE")
  IFS=$'\t' read -r attempts successes <<< "${stat_lines[0]}"
  IFS=$'\t' read -r avg_ms p95_ms max_ms <<< "${stat_lines[1]}"

  success_pct="0.0"
  if [ "$attempts" -gt 0 ]; then
    success_pct=$(awk -v ok="$successes" -v n="$attempts" 'BEGIN{printf "%.1f", (ok/n)*100}')
  fi

  row=$(printf '%-6s %-12s %-10s %-10s %-10s %-8s %-8s %-8s' \
    "$STEP_NUM" "${RATE}/s" "$attempts" "$successes" "${success_pct}%" "$avg_ms" "$p95_ms" "$max_ms")
  echo "$row"
  RESULTS+=("$row")

  if [ "$AUTO_STOP" = "true" ]; then
    below=$(awk -v p="$success_pct" -v t="$SUCCESS_THRESHOLD" 'BEGIN{print (p+0 < t+0) ? 1 : 0}')
    if [ "$below" = "1" ]; then
      echo ""
      echo "AUTO_STOP: success% (${success_pct}) fiel unter SUCCESS_THRESHOLD (${SUCCESS_THRESHOLD}) bei ${RATE}/s — Ramp gestoppt."
      break
    fi
  fi

  RATE=$(( RATE + RATE_STEP ))
done

echo ""
echo "Fertig. Aggregiere Ergebnisse..."

# ─────────────────────────────────────────────────────────────
# AUSWERTUNG — Step-Tabelle (wann bricht's ein) + Pfad-Breakdown (wo
# bricht's ein), beides in summary.txt. _all_rows.csv im selben Format
# wie loadtest.sh, damit dashboard/lib/aggregator.js unveraendert
# funktioniert.
# ─────────────────────────────────────────────────────────────

SUMMARY_FILE="${LOG_DIR}/summary.txt"
{
  echo "=== YourBrand Endpoint-Rate Summary ==="
  echo "Zeitpunkt: $(date -Iseconds)"
  echo "ENDPOINTS=${ENDPOINT_KEYS} START_RATE=${START_RATE} RATE_STEP=${RATE_STEP} STEP_SEC=${STEP_SEC} MAX_RATE=${MAX_RATE} BASE_URL=${BASE_URL}"
  echo ""

  echo "-- Stufen --"
  printf '%-6s %-12s %-10s %-10s %-10s %-8s %-8s %-8s\n' \
    "step" "target/s" "attempts" "success" "success%" "avg_ms" "p95_ms" "max_ms"
  for row in "${RESULTS[@]}"; do echo "$row"; done

  ALL_ROWS="${LOG_DIR}/_all_rows.csv"
  echo "timestamp,method,path,status,duration_ms" > "$ALL_ROWS"
  for f in "${LOG_DIR}"/step_*.csv; do
    [ -f "$f" ] && tail -n +2 "$f" >> "$ALL_ROWS"
  done

  TOTAL=$(($(wc -l < "$ALL_ROWS") - 0))
  echo ""
  echo "Requests gesamt: ${TOTAL}"

  echo ""
  echo "-- Status-Code-Verteilung --"
  awk -F',' 'NR>1 {print $4}' "$ALL_ROWS" | sort | uniq -c | sort -rn

  echo ""
  echo "-- Requests pro Pfad --"
  awk -F',' 'NR>1 {print $3}' "$ALL_ROWS" | sort | uniq -c | sort -rn

  echo ""
  echo "-- Latenz pro Pfad (avg / p95 / max, ms) --"
  awk -F',' 'NR>1 {print $3","$5}' "$ALL_ROWS" | sort -t',' -k1,1 | \
  awk -F',' '
    {
      path=$1; dur=$2+0
      arr[path][n[path]++] = dur
      sum[path] += dur
      if (dur > max[path]) max[path] = dur
    }
    END {
      for (p in arr) {
        m = n[p]
        m_sorted = asort(arr[p])
        p95idx = int(m_sorted*0.95); if (p95idx>=m_sorted) p95idx=m_sorted-1
        printf "%-30s avg=%.0f p95=%.0f max=%.0f n=%d\n", p, sum[p]/m, arr[p][p95idx+1], max[p], m
      }
    }'
} | tee "$SUMMARY_FILE"

echo ""
echo "Zusammenfassung gespeichert in: ${SUMMARY_FILE}"
