# Fehler

## 2026-10-24 — Ueberlast wurde zum Totalausfall (502 „no live upstreams“)
**Symptom:** Nach der Phase-1-Aufteilung bei 1.200-2.500 req/s auf `coin/balance` 14-43 % 502, nginx-Log: zehntausende
„no live upstreams“. Vorher (8 gemeinsame Instanzen) bis 1.800 req/s ohne Fehler.
**Ursache:** `max_fails=3 fail_timeout=5s` zusammen mit kurzen Timeouts (Connect 1 s, Lesen 5 s) und `timeout` in
`proxy_next_upstream`: unter Ueberlast liefen Verbindungsaufbau und Antworten in Timeouts, nginx zaehlte das als Fehler
der Instanz, warf eine nach der anderen fuer 5 s aus dem Pool und wiederholte GETs (doppelte Last). Erster Fix (nur
`timeout` aus `proxy_next_upstream`) reichte nicht: Connect-Timeouts zaehlten weiter.
**Fix:** `max_fails=0` (keine passive Ausmusterung, tote Instanzen lehnen sofort ab bzw. fallen nach 10 s per Resolver
raus), `proxy_next_upstream error` (fast: `error http_502`), kein Wiederholen nach Timeout.

## 2026-10-24 — Redis haengt, ganze API haengt
**Symptom:** Redis per `docker pause` angehalten: jeder eingeloggte Request bekam keine Antwort (000 nach 15 s),
`/tenant` ohne Redis lief weiter.
**Ursache:** Der Redis-Client hatte kein `commandTimeout`; Throttler-Zaehler und `userExistsCached` im JwtGuard warten
bei jedem Request auf Redis, ohne Fehlerbehandlung.
**Fix:** `commandTimeout` 500 ms, `connectTimeout` 2 s, `maxRetriesPerRequest` 1; Cache- und Zaehler-Zugriffe ueber
`redisOr` (fail-open, nach einem Fehler 5 s ohne Redis), Throttler mit `FailOpenThrottlerStorage`.

## 2026-10-23 — 500 bei parallelem Erstzugriff (Coins, Notification-Settings, Interessen)
**Symptom:** Unter Last vereinzelt 500 auf `GET /hidden/coin/balance` (9 von 1.500 bei 300 req/s), `GET/PUT
/notifications/settings` (bis 31 %) und `POST /profile/me/interests/:id` (1,6 %); Log: `duplicate key value violates
unique constraint`.
**Ursache:** Erst lesen, dann anlegen. Zwei gleichzeitige erste Requests desselben Users sehen beide „keine Zeile“ und
legen beide an; der zweite scheitert am UNIQUE-Constraint, der Exception-Filter macht daraus eine 500.
**Fix:** Anlegen per `INSERT … ON CONFLICT DO NOTHING`, der Constraint entscheidet. Startbonus bucht nur, wessen INSERT
die Zeile angelegt hat (`RETURNING`).

## 2026-10-19 — Demo-Reset: Volume laesst sich nicht loeschen
**Symptom:** `docker volume rm shop_demo_pgdata` nach `scripts/shop_demo.sh down` → „volume is in use“.
**Ursache:** `down` stoppt die Container nur (`docker stop`), entfernt sie nicht — der gestoppte `shop_demo_db` haelt
das Volume. Der Befehl in `ShopSession.md` war so nie gelaufen.
**Fix:** erst `docker rm shop_demo_db`, dann das Volume; `up` legt den Container neu an. Doku und Skript-Kommentar korrigiert.

## 2026-10-10 — ts-node-Script ausserhalb von backend/ laeuft still nicht
**Symptom:** Ein Testscript im Scratchpad (`/tmp/...`) mit Imports aus `backend/src`: erst „Cannot find module
'typeorm'“, mit absoluten Pfaden dann ESM-Fehler, mit `{"type":"commonjs"}` daneben Exit 0 ohne jede Ausgabe.
**Ursache:** ausserhalb des Pakets greifen weder `backend/node_modules` noch `backend/tsconfig.json` (Modul-Modus);
warum der letzte Lauf gar nichts ausfuehrt, ist unklar.
**Fix:** Wegwerf-Scripts unter `backend/.claude/` ablegen (gitignored) und danach loeschen.
