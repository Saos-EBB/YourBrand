> **Archiviert 2026-09-11:** Root-`docs/`-Snapshot der ersten Projektphase, seit dem Split in
> Per-Package-Docs verwaist — der Loadtest-Ordner hat sich seit dem 2026-08-05-Stand hier
> weiterentwickelt (siehe `backend/scripts/loadtest/README.md`). Nur zur Historie behalten.

# Loadtest — Ist-Zustand

Reine Analyse von `backend/scripts/loadtest/` (Stand 2026-08-05). Keine Bewertung, keine Vorschläge.

## 1. Dateiübersicht

### Top-Level (`backend/scripts/loadtest/`)

| Datei | Zeilen | Zweck |
|---|---|---|
| `actions.sh` | 192 | Shared Endpoint-Aktionen (do_request/do_upload/action_*/ACTIONS), gesourced von `loadtest.sh` und `endpoint-rate.sh`. |
| `generate-users-csv.sh` | 27 | Erzeugt `email,password`-Zeilen für die deterministischen `seed_user_*`-Accounts. |
| `prefetch-tokens.sh` | 134 | Loggt jede Zeile aus `users.csv` einmal ein, schreibt `tokens.csv`. |
| `login-capacity.sh` | 181 | Mode 1 — Stepped-Rate-Ramp gegen `POST /auth/login`. |
| `loadtest.sh` | 207 | Mode 2 — flaches Random-Action-Modell, `NUM_USERS` Worker-Prozesse. |
| `endpoint-rate.sh` | 270 | Mode 3 — Stepped-Rate-Ramp gegen eine wählbare Teilmenge der `actions.sh`-Endpoints. |
| `run-loadtest.sh` | 128 | Orchestriert Mode 2 komplett: Health-Check → Seed-Check → users.csv → prefetch → loadtest.sh → Summary. |
| `README.md` | 66 | Übersicht aller drei Modi + Dashboard-Start. |

### `dashboard/` (Node, keine Dependencies)

| Datei | Zeilen | Zweck |
|---|---|---|
| `server.js` | 398 | HTTP-Server (Port 4300), SSE-Broadcast, REST-Endpunkte für alle 3 Modi. |
| `package.json` | 10 | `npm start` → `node server.js`, keine Dependencies. |
| `lib/runner.js` | 106 | Prozesssteuerung Mode 2: spawnt `run-loadtest.sh`, parst `Logs:`/`PREFETCH x/y` aus stdout. |
| `lib/liveState.js` | 73 | In-Memory-State des laufenden Mode-2-Runs (Tailer + Aggregator-Lifecycle). |
| `lib/runs.js` | 120 | Liest vergangene `loadtest-logs/<ts>/`-Runs von der Platte. |
| `lib/capacityRunner.js` | 182 | Prozesssteuerung + stdout-Parser für Mode 1 (`login-capacity.sh`). |
| `lib/capacityRuns.js` | 61 | Liest vergangene `capacity-logs/<ts>.log`-Runs. |
| `lib/rateRunner.js` | 140 | Prozesssteuerung + stdout-Parser für Mode 3 (`endpoint-rate.sh`), Hybrid aus runner.js + capacityRunner.js. |
| `lib/rateLiveState.js` | 74 | In-Memory-State des laufenden Mode-3-Runs (identisch zu liveState.js, andere Params). |
| `lib/rateRuns.js` | 115 | Liest vergangene `endpoint-rate-logs/<ts>/`-Runs. |
| `lib/tailer.js` | 81 | Pollt ein Log-Verzeichnis auf neue Zeilen in `user_*.csv`/`admin_*.csv`/`step_*.csv`. |
| `lib/errorTailer.js` | 81 | Pollt `errors.log` (tab-separiert) auf neue Fehlerzeilen. |
| `lib/aggregator.js` | 118 | `parseRow`/`computeStats`/`RunAggregator` — zentrale Stats-Logik, 1:1-Port der awk-Blöcke aus `loadtest.sh`. |
| `lib/dockerStats.js` | 38 | Einmaliger `docker stats --no-stream --format json`-Poll pro Tick. |
| `public/index.html` | 263 | UI-Markup: 3 Mode-Tabs + History-Tab. |
| `public/app.js` | 1229 | Frontend-Logik: SSE-Client, Start/Stop, Tabellen-Rendering, Sortierung, History. |
| `public/style.css` | 423 | Styling. |
| `public/tooltips.js` | 182 | Tooltip-Texte für die Formularfelder (`data-tip`-Attribute). |

### Generierte Verzeichnisse (nicht Quellcode, zur Laufzeit erzeugt)
`capacity-logs/`, `loadtest-logs/<ts>/`, `endpoint-rate-logs/<ts>/` — Output der jeweiligen Modi, siehe Abschnitt 2–3.

## 2. Aufrufkette

```
run-loadtest.sh (Mode 2 Orchestrator)
  1. Health-Check: curl gegen LOADTEST_BASE_URL (http://localhost:3100/api/v1)
  2. Seed-Check: Login-Probe gegen seed_user_<TOKEN_POOL_SIZE>
  3. generate-users-csv.sh  → schreibt users.csv
  4. prefetch-tokens.sh     → liest users.csv, schreibt tokens.csv
  5. loadtest.sh            → sourced: actions.sh
                            → liest tokens.csv
                            → schreibt loadtest-logs/<ts>/user_*.csv, errors.log, summary.txt, _all_rows.csv
  6. cat des summary.txt

endpoint-rate.sh (Mode 3, eigenständig)
  → sourced: actions.sh
  → erzeugt bei Bedarf selbst users.csv (generate-users-csv.sh) + tokens.csv (prefetch-tokens.sh)
  → schreibt endpoint-rate-logs/<ts>/step_*.csv, errors.log, summary.txt, _all_rows.csv

login-capacity.sh (Mode 1, eigenständig)
  → erzeugt bei Bedarf selbst users.csv (generate-users-csv.sh)
  → schreibt NICHTS unter loadtest-logs/ — nur stdout-Tabelle
```

### Steuernde Env-Vars (zentral)

| Var | Wirkung | Verwendet in |
|---|---|---|
| `NUM_USERS` / `DURATION_SEC` | Worker-Anzahl / Testdauer Mode 2 | `run-loadtest.sh`, `loadtest.sh` |
| `TOKEN_POOL_TARGET` | Soll-Pool-Größe, nur für Warnzeile in Summary | `loadtest.sh` (von `run-loadtest.sh` durchgereicht) |
| `BASE_URL` | Ziel-API | `actions.sh`, `login-capacity.sh`, `prefetch-tokens.sh`, `endpoint-rate.sh` |
| `USERS_FILE` / `TOKENS_FILE` | Pfad-Override für die CSVs | `prefetch-tokens.sh`, `loadtest.sh`, `endpoint-rate.sh`, `login-capacity.sh` |
| `COUNT` | Anzahl Zeilen | `generate-users-csv.sh` |
| `BATCH_SIZE` / `BATCH_PAUSE` / `RETRIES` | Prefetch-Parallelität/Pause/Retries | `prefetch-tokens.sh` |
| `MIN_DELAY_SEC` / `MAX_DELAY_SEC` / `RAMP_SEC` | Think-Time-Range / Worker-Startfenster | `loadtest.sh` |
| `START_RATE` / `RATE_STEP` / `STEP_SEC` / `MAX_RATE` | Rampenparameter | `login-capacity.sh`, `endpoint-rate.sh` |
| `AUTO_STOP` / `SUCCESS_THRESHOLD` | Ramp bricht bei Erfolgsquote-Unterschreitung ab | `login-capacity.sh`, `endpoint-rate.sh` |
| `ENDPOINTS` / `TOKEN_POOL_SIZE` | Endpoint-Auswahl (leer=alle) / Token-Pool-Größe (Default 500) | `endpoint-rate.sh` |
| `TEST_PHOTO` | Pfad zur Upload-Testdatei | `actions.sh` |
| `SEED_USERS` / `SEED_RESET` / `LOADTEST_MODE` | Seed-Umfang bzw. `hidden/coin/test-purchase`-Freischaltung | `docker-compose.loadtest.yml` |

### Erzeugte/gelesene Dateien

- `users.csv` (generate-users-csv.sh) → gelesen von `prefetch-tokens.sh`, `login-capacity.sh`.
- `tokens.csv` (prefetch-tokens.sh) → gelesen von `loadtest.sh`, `endpoint-rate.sh`.
- `loadtest-logs/<ts>/user_{idx}.csv` (`simulate_user()`), `errors.log` (`log_error_if_needed()` in actions.sh), `_all_rows.csv`/`summary.txt` (Auswertungsblock am Skript-Ende).
- `endpoint-rate-logs/<ts>/step_{n}.csv`, `errors.log`, `_all_rows.csv`, `summary.txt` — analog für Mode 3.
- `capacity-logs/<ts>.log` (roher stdout) + `<ts>.json` (Params) — geschrieben von `dashboard/lib/capacityRunner.js`, nicht vom Bash-Skript (Mode 1 schreibt nur stdout).

## 3. tokens.csv — Format

- **Spalten:** `email,token` · **Trennzeichen:** Komma · **Header:** keiner.
- **Geschrieben von:** `prefetch-tokens.sh`, Funktion `login_with_retry()` (Zeile 82): `printf '%s,%s\n' "$email" "$token" > "$out_file"`, batchweise in `TOKENS_FILE` angehängt (Zeile 108). Vor dem Lauf geleert (`: > "$TOKENS_FILE"`, Zeile 58).
- **Gelesen von:** `loadtest.sh` (Zeile 107/136): `mapfile -t TOKEN_LINES`, dann `IFS=',' read -r email token <<< "${TOKEN_LINES[$token_idx]}"`, `token_idx = i % AVAILABLE_TOKENS`. `endpoint-rate.sh` (Zeile 91/144): identisch, `TOKEN_CURSOR % AVAILABLE_TOKENS`.
- Fehlgeschlagene Logins fehlen einfach (keine Leerzeile) — Email landet stattdessen in `SKIPPED_FILE`, am Ende auf stdout gelistet.
- `users.csv` (vorgelagert): dasselbe Format, aber `email,password`.

## 4. Request-Mix in `loadtest.sh` (via `actions.sh`)

Pro Tick wählt jeder simulierte User **eine** zufällige Aktion aus dem flachen Array `ACTIONS` (Gleichgewichtung, `actions.sh:179-192`, 12 Einträge — Mehrfach-Calls innerhalb einer Aktion wie beim Chat-Flow zählen als eine Auswahl, aber mehrere geloggte Requests):

| Aktion | Endpoint(s) |
|---|---|
| `action_discover_deck` | `GET /discover/deck` |
| `action_discover_matches` | `GET /discover/matches` |
| `action_coin_balance` | `GET /hidden/coin/balance` |
| `action_coin_test_purchase` | `POST /hidden/coin/test-purchase` (nur `LOADTEST_MODE=true`, sonst 404) |
| `action_media_upload` | `POST /media/upload/profile-photo` (multipart) |
| `action_chat_conversations_list` | `GET /chat/conversations` |
| `action_chat_messages_list` | `GET /chat/conversations` → `GET .../{id}/messages` (Quick-GET für ID) |
| `action_chat_messages_post` | `GET /chat/conversations` → `POST .../{id}/messages` |
| `action_contact_request_send` | `GET /discover/deck` → `POST /chat/requests` |
| `action_contact_request_incoming` | `GET /chat/requests/incoming` |
| `action_contact_request_accept` | `GET /chat/requests/incoming` → `PATCH .../{id}/accept` |
| `action_admin_pending` | `GET /admin/media/pending` (Token ohne Owner-Rolle → erwartetes 403) |

**Think-Time:** `random_delay()` schläft zwischen `MIN_DELAY_SEC` (Default 2) und `MAX_DELAY_SEC` (Default 25) Sekunden zwischen zwei Aktionen desselben Users.

**Bewertung der Antworten:**
- `do_request`/`do_upload` loggen jede Antwort als `timestamp,method,path,status,duration_ms` in die User-CSV — unabhängig vom Status.
- `log_error_if_needed()` (`actions.sh:31`) schreibt zusätzlich nur bei `status == "000"` (toter Connect) oder `status >= 500` eine Zeile in `errors.log`. 4xx wird bewusst **nicht** als Fehler gewertet (erwartete Ablehnungen: doppelte Anfrage, fehlende Coins, 403 auf Admin-Endpoint).
- Die Dashboard-Aggregation (`aggregator.js:categorizeStatus`) klassifiziert dieselbe Grenze weiter aus: `2xx → success`, `4xx → expectedReject`, `5xx/"000"/"FAIL" → error`.

## 5. Dashboard-Anbindung

Der Dashboard-Server führt die Lasttests **nicht selbst aus** — er spawnt die Bash-Skripte als Kindprozesse und liest nur, was diese auf Platte/stdout schreiben. Zwei Mechanismen:

- **Mode 2/3 (Datei):** `dashboard/lib/tailer.js` pollt alle `CSV_POLL_MS=1000ms` (`server.js:42`) das Log-Verzeichnis per `readdir` auf Dateien, die `^(user_\d+|admin_[\w-]+|step_\d+)\.csv$` matchen (`tailer.js:22`), hält pro Datei FD+Byte-Offset, liest nur neu angehängte Bytes, parst via `aggregator.js:parseRow` (exakt 5 Spalten). Das Log-Verzeichnis wird erkannt, indem `runner.js`/`rateRunner.js` den Kind-stdout nach `Logs:\s+(\S+)` durchsucht (`runner.js:60`) — diese Zeile schreiben die Skripte selbst.
- **Mode 1 (stdout):** Kein Log-Verzeichnis. `capacityRunner.js` hängt sich direkt an `child.stdout`/`stderr` (Zeile 101-102), parst jede Zeile gegen `ROW_RE` (Zeile 21) für die Step-Tabellenzeile, persistiert roh nach `capacity-logs/<ts>.log`. Mode 3 nutzt dasselbe `ROW_RE` zusätzlich zur eigenen Log-Tailing, da `endpoint-rate.sh` dieselbe Tabellenzeile druckt.

Live-Updates per **SSE** (`GET /api/events`, `server.js:53`, `broadcast()`), getriggert von zwei `setInterval`-Loops (CSV-Tick, Docker-Stats alle `DOCKER_POLL_MS=2000ms`) plus `EventEmitter`-Events der Runner (`prefetch`, `logdir`, `exit`, `started`, `line`).

**Schnittstellen-Zeilenformat:** exakt `timestamp,method,path,status,duration_ms`, kein Header in Rohzeilen (Header wird beim Parsen übersprungen, `aggregator.js:17`).

## 6. Konfiguration (Rate/Dauer/User-Anzahl)

- **CLI/Env:** Mode 2 Positionsargumente `./run-loadtest.sh [NUM_USERS] [DURATION_SEC]` (Default 100/60, `run-loadtest.sh:44-45`). Mode 1/3 nur über Env-Vars: `START_RATE`/`RATE_STEP`/`STEP_SEC`/`MAX_RATE`, Mode 1 (`login-capacity.sh`) Defaults 5/5/10/50, Mode 3 (`endpoint-rate.sh`) Defaults 5/5/10/2000.
- **Dashboard-UI:** Mode 2 Feld `#num-users` (Default 100, `index.html:21`; `durationSec` laut `server.js:154` ebenfalls aus dem Request-Body erwartet). Mode 1 `#cap-start-rate`/`#cap-rate-step`/`#cap-step-sec`/`#cap-max-rate` (Zeilen 108-111). Mode 3 `#rate-start-rate`/`#rate-rate-step`/`#rate-step-sec`/`#rate-max-rate` (Zeilen 175-178) plus Endpoint-Auswahl und `tokenPoolSize`. `app.js` sammelt die Werte ein und schickt sie per `POST /api/start`|`/api/capacity/start`|`/api/rate/start` als JSON; `server.js` reicht sie als Env-Vars an `spawn()` durch (Zeilen 145-269).
- **Seed-Anzahl:** `SEED_USERS` als Env-Var für `XXX_backend_load` (`docker-compose.loadtest.yml:69`), ausgewertet von `seed-extra-users.ts`.

## 7. Loadtest-Stack — `docker-compose.loadtest.yml`

Override-Datei (zusätzlich zu `docker-compose.yml`, kein Ersatz), fügt zwei neue Services + ein Network + ein Volume hinzu, erweitert `pgadmin` nur um eine zweite Netzwerk-Mitgliedschaft:

| Service | Image/Build | Ports | Zweck |
|---|---|---|---|
| `XXX_db_load` | Build aus `backend/db/Dockerfile` | Host `5532` → Container `5432` | Eigene Postgres-Instanz, eigenes Volume `XXX_load_pgdata`, Healthcheck via `pg_isready`. |
| `XXX_backend_load` | Build aus `backend/` (Root-Dockerfile) | Host `3100` → Container `3000` | Backend gegen die Loadtest-DB, `depends_on: XXX_db_load` mit `condition: service_healthy`. |
| `pgadmin` | (unverändert aus `docker-compose.yml`) | — | Nur zusätzliches Netzwerk `XXX_load_network`, damit pgAdmin `XXX_db_load` per Docker-DNS unter Port `5432` (intern) erreicht. |

**Environment von `XXX_backend_load`:** `LOADTEST_MODE=true` (schaltet `POST /hidden/coin/test-purchase` frei), `SEED_USERS` (Default 5000), `SEED_TX_PER_USER=0`/`SEED_MEDIA_PER_USER=0` (fest — Coin-Historie entsteht live per `test-purchase`), `SEED_RESET` (Default `false`).

**Seed-Ablauf** (`backend/docker-entrypoint.sh`, unverändert mitgenutzt): `demo-seed.ts` → `demo-relations-seed.ts` → `seed-extra-users.ts` (muss vor den folgenden drei laufen, deren "alle User"-Query sonst die Fake-User nicht sieht) → `seed-coin-transactions.ts` → `seed-subscriptions-payments.ts` → `seed-media.ts` → `seed-cities.ts` → `backfill-profile-locations.ts` → `npm run start:dev`. Alle Seeds idempotent; `SEED_RESET=true` löscht vorher die `seed_user_*`-Daten.

**Start-Befehl:** `docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d XXX_db_load XXX_backend_load` (optional `pgadmin`).
