#!/usr/bin/env bash
#
# Wrapper fuer die komplette Mode-2-Kette in einem Befehl: Health-Check auf
# den Loadtest-Stack -> pruefen ob genug Fake-User geseedet sind -> users.csv
# erzeugen -> Tokens prefetchen -> loadtest.sh (flaches Random-Action-Modell)
# starten -> Summary ausgeben.
#
# NUM_USERS ist die Anzahl gleichzeitiger Worker-Prozesse (= Last), NICHT
# mehr die Anzahl eindeutiger DB-Accounts — ein Token wird von mehreren
# Workern gleichzeitig benutzt (siehe loadtest.sh: Token-Zuweisung per
# index % AVAILABLE_TOKENS). Das ist fuer reine Lasttests (keine Per-User-
# Korrektheit als Ziel, siehe loadtest.sh's eigener Header-Kommentar)
# voellig ausreichend: ein JWT authentifiziert beliebig viele Requests,
# unabhaengig davon, ob "sein" Worker gerade der einzige ist, der es
# benutzt. Der tatsaechlich benoetigte Account-Pool ist daher viel kleiner
# als NUM_USERS: TOKEN_POOL_SIZE = NUM_USERS/10 (mindestens NUM_USERS
# selbst, wenn das schon unter 10 liegt) — bei NUM_USERS=100000 also nur
# 10000 Accounts statt 100000. users.csv wird bei jedem Lauf frisch mit
# exakt TOKEN_POOL_SIZE Zeilen erzeugt und das auch verifiziert; kommt der
# Prefetch trotzdem mit weniger Tokens als TOKEN_POOL_SIZE zurueck (z.B.
# einzelne fehlgeschlagene Logins trotz Retries), landet das laut+lesbar
# in summary.txt statt zu verschwinden — siehe loadtest.sh fuer den
# WARNUNG-Eintrag dort. NUM_USERS selbst wird dadurch NICHT mehr
# runterkorrigiert — es laufen immer genau so viele Worker wie angefordert.
#
# Usage:
#   ./run-loadtest.sh [NUM_USERS] [DURATION_SEC]
#   ./run-loadtest.sh 100 60
#   (ohne Argumente: NUM_USERS=100 DURATION_SEC=60)
#
# Voraussetzung: Loadtest-Stack laeuft bereits, z.B.
#   docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d \
#     XXX_db_load XXX_backend_load
#
# BATCH_SIZE/BATCH_PAUSE fuer den Prefetch-Schritt lassen sich hier
# durchreichen, z.B. nach einem login-capacity.sh-Lauf:
#   BATCH_SIZE=30 BATCH_PAUSE=1 ./run-loadtest.sh 1000 300
#
set -uo pipefail   # bewusst KEIN -e, siehe loadtest.sh — klare Fehlermeldung statt Abbruch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"   # users.csv/tokens.csv/loadtest-logs liegen relativ zu diesem Ordner

NUM_USERS="${1:-100}"
DURATION_SEC="${2:-60}"
LOADTEST_BASE_URL="http://localhost:3100/api/v1"

# Accounts/Tokens werden wiederverwendet (siehe Header oben) — der Pool
# muss nur ~1/10 von NUM_USERS gross sein. Fuer kleine Laeufe (<10 Worker)
# lohnt sich Wiederverwendung nicht, da faellt der Pool auf NUM_USERS
# zurueck (jeder Worker bekommt seinen eigenen Token, wie frueher).
TOKEN_POOL_SIZE=$(( NUM_USERS / 10 ))
if [ "$TOKEN_POOL_SIZE" -lt 1 ]; then
  TOKEN_POOL_SIZE="$NUM_USERS"
fi

echo "=== 1/6: Health-Check auf ${LOADTEST_BASE_URL} ==="
# AppController (GET /api/v1) ist jetzt registriert und liefert
# {"status":"ok","uptime":N} — der healthcheckPath aus railway.json, per
# @SkipThrottle von der globalen 100req/60s-Quote ausgenommen. Damit ist
# HTTP 200 hier die eigentliche Erwartung, nicht mehr nur "irgendein Code
# ungleich 000".
response=$(curl -s -m 5 -w '\nHTTPSTATUS:%{http_code}' "${LOADTEST_BASE_URL}" 2>/dev/null)
status=$(printf '%s' "$response" | grep -o 'HTTPSTATUS:[0-9]*$' | cut -d: -f2)
body=$(printf '%s' "$response" | sed -e 's/HTTPSTATUS:[0-9]*$//')
if [ "$status" != "200" ]; then
  echo "Fehler: Loadtest-Stack unter ${LOADTEST_BASE_URL} nicht erreichbar (HTTP ${status:-000})."
  echo "Starten mit:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d XXX_db_load XXX_backend_load"
  exit 1
fi
echo "OK (HTTP ${status}, ${body})"

# seed-extra-users.ts fills seed_user_0001..SEED_USERS CONTIGUOUSLY and only
# ever tops up (never shrinks, see its own header comment) — so the last
# index we need existing is sufficient proof all earlier ones exist too. One
# login attempt here is a lot cheaper than discovering the shortfall via a
# 10000-row prefetch that silently comes back with a fraction of that.
echo ""
echo "=== 2/6: Pruefe ob ${TOKEN_POOL_SIZE} Fake-User (Token-Pool fuer ${NUM_USERS} Worker) in der Loadtest-DB geseedet sind ==="
probe_email=$(printf 'seed_user_%04d@seed.local' "$TOKEN_POOL_SIZE")
probe_status=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -X POST "${LOADTEST_BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"${probe_email}\",\"password\":\"SeedUser1234!\"}" 2>/dev/null)
if [ "$probe_status" != "200" ]; then
  echo "Fehler: ${probe_email} existiert nicht (HTTP ${probe_status}) — es sind weniger als ${TOKEN_POOL_SIZE} Fake-User in der Loadtest-DB geseedet."
  echo "Stack mit ausreichend Usern neu hochfahren (vorhandene Fake-User bleiben erhalten, es werden nur die fehlenden ergaenzt):"
  echo "  SEED_USERS=${TOKEN_POOL_SIZE} docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d XXX_db_load XXX_backend_load"
  exit 1
fi
echo "OK (seed_user_${TOKEN_POOL_SIZE} existiert)"

echo ""
echo "=== 3/6: users.csv fuer Token-Pool (${TOKEN_POOL_SIZE} Accounts, von ${NUM_USERS} Workern geteilt) erzeugen ==="
COUNT="$TOKEN_POOL_SIZE" ./generate-users-csv.sh > users.csv
users_csv_rows=$(wc -l < users.csv)
echo "-> ${SCRIPT_DIR}/users.csv (${users_csv_rows} Zeilen)"
if [ "$users_csv_rows" -ne "$TOKEN_POOL_SIZE" ]; then
  echo "Fehler: users.csv hat ${users_csv_rows} Zeilen, erwartet ${TOKEN_POOL_SIZE} — generate-users-csv.sh hat COUNT nicht eingehalten. Abbruch."
  exit 1
fi

echo ""
echo "=== 4/6: Tokens prefetchen ==="
BASE_URL="$LOADTEST_BASE_URL" ./prefetch-tokens.sh
prefetch_exit=$?
if [ "$prefetch_exit" -ne 0 ]; then
  echo "Fehler: prefetch-tokens.sh ist fehlgeschlagen (keine oder zu wenige Tokens) — Abbruch."
  exit "$prefetch_exit"
fi

echo ""
echo "=== 5/6: loadtest.sh (NUM_USERS=${NUM_USERS} DURATION_SEC=${DURATION_SEC}, Token-Pool-Ziel ${TOKEN_POOL_SIZE}) ==="
BASE_URL="$LOADTEST_BASE_URL" NUM_USERS="$NUM_USERS" DURATION_SEC="$DURATION_SEC" \
  TOKEN_POOL_TARGET="$TOKEN_POOL_SIZE" ./loadtest.sh
loadtest_exit=$?

echo ""
echo "=== 6/6: Summary ==="
latest_log_dir=$(ls -1dt loadtest-logs/*/ 2>/dev/null | head -1)
if [ -z "$latest_log_dir" ]; then
  echo "Keine Logs gefunden — loadtest.sh ist vermutlich fehlgeschlagen."
  exit "$loadtest_exit"
fi

summary_file="${latest_log_dir}summary.txt"
echo "Summary: ${SCRIPT_DIR}/${summary_file}"
echo ""
cat "$summary_file"

exit "$loadtest_exit"
