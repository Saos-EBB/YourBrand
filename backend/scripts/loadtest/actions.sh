#!/usr/bin/env bash
#
# Shared endpoint actions — sourced (not executed) by loadtest.sh (Mode 2,
# flat random-action model) and endpoint-rate.sh (Mode 3, stepped rate ramp
# against a chosen subset of these same actions). Single source of truth so
# the two modes can never drift apart on what an endpoint call actually
# does. Extracted from loadtest.sh unchanged — see git history there for
# the original per-action commentary.
#
# Requires from the sourcing script, set before any action actually runs
# (defining these functions doesn't need them yet, only calling one does):
#   ERRORS_FILE   — log_error_if_needed() appends here
# Optional, have their own defaults if unset:
#   BASE_URL, TEST_PHOTO, ADMIN_LOGIN/ADMIN_PASSWORD, ADMIN_APPROVE_PCT
# Optional, vom sourcenden Skript nach dem Laden des Token-Pools gesetzt:
#   TOKEN_LINES   — fuer init_pool_user_ids (Ziele fuer Kontaktanfragen)
#
# admin_pending laeuft mit einem eigenen Admin-Token (admin_login, Demo-
# Account admin1 aus demo-users.yaml), nicht mit dem Pool-Token — seed_user_*
# sind alle role=user und bekaemen nur 403.

BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"
ACTIONS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_PHOTO="${TEST_PHOTO:-${ACTIONS_SCRIPT_DIR}/test-photo.jpg}"  # fuer action_media_upload
# Nickname statt E-Mail: der E-Mail-Login (email_search_hash) scheitert fuer
# die Demo-Accounts im alten Loadtest-Volume, der Nickname-Login nicht.
ADMIN_LOGIN="${ADMIN_LOGIN:-gutz}"   # admin1 aus demo-users.yaml
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Demo1234!}"
ADMIN_APPROVE_PCT="${ADMIN_APPROVE_PCT:-85}"  # Rest wird rejected
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
POOL_USER_IDS=()

# Loggt den Admin ein und setzt ADMIN_TOKEN. Einmal vom sourcenden Skript vor
# dem Start der Worker aufrufen; action_admin_pending loggt bei 401 (Token
# nach 15 min abgelaufen) selbst neu ein. Nicht in die User-CSV geloggt —
# gemessen wird der Admin-Endpoint, nicht dieser Login.
admin_login() {
  ADMIN_TOKEN=$(curl -s -m 10 -X POST "${BASE_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"${ADMIN_LOGIN}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
  [ -n "$ADMIN_TOKEN" ]
}

# User-IDs (JWT "sub") aller Pool-Tokens nach POOL_USER_IDS. Kontaktanfragen
# gehen an diese User statt an zufaellige Deck-Kandidaten: die liegen meist
# ausserhalb des Pools (Pool = Bruchteil der geseedeten User), deren Anfragen
# nimmt dann nie jemand an — und ohne Annahme keine Conversations, also auch
# kein chat_messages_*.
init_pool_user_ids() {
  POOL_USER_IDS=()
  local line token payload sub
  for line in "${TOKEN_LINES[@]}"; do
    token="${line#*,}"
    payload="${token#*.}"; payload="${payload%%.*}"
    payload="${payload//-/+}"; payload="${payload//_//}"
    while [ $(( ${#payload} % 4 )) -ne 0 ]; do payload+="="; done
    sub=$(printf '%s' "$payload" | base64 -d 2>/dev/null | grep -o '"sub":"[^"]*"' | cut -d'"' -f4)
    [ -n "$sub" ] && POOL_USER_IDS+=("$sub")
  done
}

# UUIDs im Pfad -> ":id", damit das Dashboard/die Auswertung pro Endpoint
# gruppiert statt pro Conversation/Medium. Setzt LOG_PATH.
normalize_path() {
  LOG_PATH="$1"
  while [[ "$LOG_PATH" =~ ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) ]]; do
    LOG_PATH="${LOG_PATH/${BASH_REMATCH[1]}/:id}"
  done
}

# 4xx sind bei diesem Lastansatz erwartet (z.B. "Anfrage bereits gesendet",
# "insufficient coins", 403 auf admin_pending fuer Nicht-Owner) und werden
# NICHT hier geloggt — nur echte Fehler: 5xx oder eine tote Verbindung
# (curl liefert dann "000", siehe do_request).
# Args: <METHOD> <path> <status> <response_body>
log_error_if_needed() {
  local method="$1" path="$2" status="$3" body="$4"
  if [ "$status" = "000" ] || { [[ "$status" =~ ^[0-9]+$ ]] && [ "$status" -ge 500 ]; }; then
    local snippet="${body:0:500}"
    snippet="${snippet//$'\n'/ }"
    snippet="${snippet//$'\t'/ }"
    printf '%s\t%s\t%s\t%s\t%s\n' "$(date -Iseconds)" "$method" "$path" "$status" "$snippet" >> "$ERRORS_FILE"
  fi
}

# Führt einen Request aus, loggt Status-Code + Dauer in die User-Logdatei.
# Args: <user_log_file> <token|-> <METHOD> <path> [json_body]
# Setzt RESPONSE_BODY/RESPONSE_STATUS als Nebeneffekt — fuer Aktionen, die die Antwort
# auswerten muessen (z.B. eine ID fuer den naechsten Call brauchen), ohne
# dafuer einen zweiten curl-Call nur zum Parsen zu brauchen.
do_request() {
  local logfile="$1" token="$2" method="$3" path="$4" body="${5:-}"
  local auth_header=()
  [ "$token" != "-" ] && auth_header=(-H "Authorization: Bearer ${token}")

  local start end dur raw status
  start=$(date +%s%3N)
  if [ -n "$body" ]; then
    raw=$(curl -s -m 10 -X "$method" "${BASE_URL}${path}" \
      -H "Content-Type: application/json" \
      "${auth_header[@]}" -d "$body" -w $'\n%{http_code}')
  else
    raw=$(curl -s -m 10 -X "$method" "${BASE_URL}${path}" \
      "${auth_header[@]}" -w $'\n%{http_code}')
  fi
  end=$(date +%s%3N)
  dur=$(( end - start ))

  RESPONSE_BODY="${raw%$'\n'*}"
  status="${raw##*$'\n'}"
  [ -z "$status" ] && status="000"   # curl killed/no response at all -> treat like connection failure

  RESPONSE_STATUS="$status"
  normalize_path "$path"
  echo "$(date -Iseconds),${method},${LOG_PATH},${status},${dur}" >> "$logfile"
  log_error_if_needed "$method" "$path" "$status" "$RESPONSE_BODY"
}

# Multipart-Datei-Upload, loggt wie do_request. Args: <logfile> <token> <path> <field> <filepath>
do_upload() {
  local logfile="$1" token="$2" path="$3" field="$4" filepath="$5"
  local start end dur raw status body
  start=$(date +%s%3N)
  raw=$(curl -s -m 10 -X POST "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${token}" \
    -F "${field}=@${filepath};type=image/jpeg" \
    -w $'\n%{http_code}')
  end=$(date +%s%3N)
  dur=$(( end - start ))

  body="${raw%$'\n'*}"
  status="${raw##*$'\n'}"
  [ -z "$status" ] && status="000"

  echo "$(date -Iseconds),POST,${path},${status},${dur}" >> "$logfile"
  log_error_if_needed POST "$path" "$status" "$body"
}

# ─────────────────────────────────────────────────────────────
# AKTIONEN — je eine pro bekanntem Endpoint, gleichgewichtet in ACTIONS.
# Der Schluessel fuer Endpoint-Auswahl (z.B. endpoint-rate.sh's ENDPOINTS=)
# ist der Funktionsname ohne "action_"-Praefix, z.B. "discover_deck".
# ─────────────────────────────────────────────────────────────

action_discover_deck() {
  do_request "$1" "$2" GET "/discover/deck"
}

action_discover_matches() {
  do_request "$1" "$2" GET "/discover/matches"
}

action_coin_balance() {
  do_request "$1" "$2" GET "/hidden/coin/balance"
}

# Nur erreichbar wenn Backend mit LOADTEST_MODE=true laeuft (siehe CoinModule) —
# sonst 404 (zaehlt als EXPECTED-REJECT, nicht als Bug).
action_coin_test_purchase() {
  do_request "$1" "$2" POST "/hidden/coin/test-purchase"
}

action_media_upload() {
  do_upload "$1" "$2" "/media/upload/profile-photo" "file" "$TEST_PHOTO"
}

action_chat_conversations_list() {
  do_request "$1" "$2" GET "/chat/conversations"
}

# Quick-GET auf /chat/conversations um eine ID zu holen; ohne Conversation
# bleibt es bei diesem einen GET (kein Fallback-Call moeglich).
action_chat_messages_list() {
  local logfile="$1" token="$2"
  do_request "$logfile" "$token" GET "/chat/conversations"
  local conv_id
  conv_id=$(printf '%s' "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$conv_id" ] && do_request "$logfile" "$token" GET "/chat/conversations/${conv_id}/messages"
}

action_chat_messages_post() {
  local logfile="$1" token="$2"
  do_request "$logfile" "$token" GET "/chat/conversations"
  local conv_id
  conv_id=$(printf '%s' "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$conv_id" ]; then
    do_request "$logfile" "$token" POST "/chat/conversations/${conv_id}/messages" \
      "{\"content\":\"loadtest message $(date +%s%N)\"}"
  fi
}

# Kontaktanfrage an einen zufaelligen anderen Pool-User (siehe
# init_pool_user_ids), damit contact_request_accept auch etwas zum Annehmen
# findet. 409 heisst "gab's schon" — bei kleinem Pool unter Last erwartet.
# Ohne POOL_USER_IDS (init nicht aufgerufen) wie frueher: Ziel aus dem Deck.
action_contact_request_send() {
  local logfile="$1" token="$2"
  local ids=() self_id
  if [ "${#POOL_USER_IDS[@]}" -gt 1 ]; then
    ids=("${POOL_USER_IDS[@]}")
  else
    do_request "$logfile" "$token" GET "/discover/deck"
    while IFS= read -r id; do
      [ -n "$id" ] && ids+=("$id")
    done < <(printf '%s' "$RESPONSE_BODY" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
  fi
  [ "${#ids[@]}" -eq 0 ] && return
  local target="${ids[$((RANDOM % ${#ids[@]}))]}"
  # Anfrage an sich selbst waere ein 400 — dann einen Nachbarn nehmen.
  self_id=$(printf '%s' "${token#*.}" | cut -d. -f1 | tr '_-' '/+' | base64 -d 2>/dev/null | grep -o '"sub":"[^"]*"' | cut -d'"' -f4)
  [ "$target" = "$self_id" ] && target="${ids[$(( (RANDOM + 1) % ${#ids[@]} ))]}"
  [ "$target" = "$self_id" ] && return
  do_request "$logfile" "$token" POST "/chat/requests" "{\"receiver_id\":\"${target}\"}"
}

action_contact_request_incoming() {
  do_request "$1" "$2" GET "/chat/requests/incoming"
}

# Quick-GET auf die eigenen Incoming-Requests, erste (falls vorhanden)
# annehmen. PATCH .../accept 409t, wenn der Request inzwischen von
# woanders schon beantwortet wurde — erwartet unter Last, kein Bug.
action_contact_request_accept() {
  local logfile="$1" token="$2"
  do_request "$logfile" "$token" GET "/chat/requests/incoming"
  local first_id
  first_id=$(printf '%s' "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$first_id" ] && do_request "$logfile" "$token" PATCH "/chat/requests/${first_id}/accept"
}

# Admin-Moderation: Pending-Liste holen, ein zufaelliges Medium daraus
# ADMIN_APPROVE_PCT % approven, sonst rejecten. Zufaellig statt das erste,
# damit parallele Worker nicht alle dasselbe Medium bearbeiten. Haelt
# nebenbei die Pending-Queue klein, die media_upload sonst unbegrenzt
# wachsen laesst (GET /admin/media/pending hat kein LIMIT).
# Ohne Admin-Token (Login fehlgeschlagen) Fallback auf den Pool-Token -> 403.
action_admin_pending() {
  local logfile="$1" token="${ADMIN_TOKEN:-$2}"
  do_request "$logfile" "$token" GET "/admin/media/pending"
  if [ "$RESPONSE_STATUS" = "401" ] && [ -n "$ADMIN_TOKEN" ] && admin_login; then
    token="$ADMIN_TOKEN"
    do_request "$logfile" "$token" GET "/admin/media/pending"
  fi
  [ "$RESPONSE_STATUS" = "200" ] || return

  local ids=()
  while IFS= read -r id; do
    [ -n "$id" ] && ids+=("$id")
  done < <(printf '%s' "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -50)
  [ "${#ids[@]}" -eq 0 ] && return
  local media_id="${ids[$((RANDOM % ${#ids[@]}))]}"
  if [ $((RANDOM % 100)) -lt "$ADMIN_APPROVE_PCT" ]; then
    do_request "$logfile" "$token" PATCH "/admin/media/${media_id}/approve"
  else
    do_request "$logfile" "$token" PATCH "/admin/media/${media_id}/reject" \
      '{"reason":"loadtest reject"}'
  fi
}

ACTIONS=(
  action_discover_deck
  action_discover_matches
  action_coin_balance
  action_coin_test_purchase
  action_media_upload
  action_chat_conversations_list
  action_chat_messages_list
  action_chat_messages_post
  action_contact_request_send
  action_contact_request_incoming
  action_contact_request_accept
  action_admin_pending
)
