## 2026-10-24 — fix(beef): Zustandswechsel atomar, ein Spiel pro Beef
**Was:** Audit B3, erster Teil. `startGamePhase` und `chickenBeef` wechseln den Status per `UPDATE … WHERE status = …`
und machen nur weiter, wenn sie die Zeile geaendert haben; Zug- und Ready-Timeout loesen ihre Frist atomar ein
(`claimExpiredMoveDeadline`, `game_deadline_at`); `resolve` schliesst per `UPDATE … WHERE status <> 'closed'` in der
Transaktion ab (keine doppelten Badges/Exil). Migration `010_beef_games_unique_beef.sql` (UNIQUE `beef_id`, im DB-Image,
im Loadtest-Stack von Hand angewandt; vorher 5 Spiele / 5 Beefs). Gemessen, 8 gleichzeitige Chicken-Antworten: alte Logik
`chicken_count` +5, neue +1.
**Nicht gebaut:** Crons laufen noch auf jeder Instanz (naechster Step); `ACCEPT`/`APPROVE`-Wechsel nicht umgestellt
(kommen nicht aus Crons). Migration 010 auf `XXX_db` (Dev-DB) und Tenants noch nicht angewandt.

## 2026-10-24 — fix(beef): Beef ausschlagen funktioniert wieder
**Was:** Altfehler (Eintrag in `errors.md`): `User` kennt jetzt `chicken_count`, damit laufen manuelles Chicken und der
Auto-Chicken-Cron durch.
**Nicht gebaut:** keine Anzeige des Zaehlers, kein Abgleich weiterer Entity-Spalten.

## 2026-10-24 — perf(auth): Last-Active hoechstens einmal pro Minute und User
**Was:** Audit B13. `LastActiveService.touch` schreibt pro User und Instanz hoechstens alle 60 s nach Redis (vorher
SET + SADD bei jedem eingeloggten Request); `flush()` uebertraegt ohnehin nur minuetlich. Test 1/1. Gemessen
`coin/balance` 1.000 req/s, warm: Redis 3.000 → 1.000-1.470 Befehle/s, CPU der 5 fast-Replikas 402 % → 294 %, p95
410 ms → 11-87 ms, 0 Fehler (erster Lauf direkt nach Neustart war kalt: p95 2,5 s).
**Nicht gebaut:** kein Pipelining des Exists-Checks, keine Bann-Pruefung pro Request (`token_version`). Phase-2-Punkte
B12 (Deck) und B14 (Paar-Abfragen) bewusst nicht umgesetzt: Deck 150/s bei p95 15 ms, Paar-Abfragen laufen seit der
Such-Pagination nur noch fuer 30 Profile; Umbau ohne gemessenen Grund wuerde Ranking bzw. Abfragen aendern.

## 2026-10-24 — fix(loadtest): Ueberlast fuehrt nicht mehr zum Totalausfall
**Was:** nginx-Fehler aus Phase 1 (Eintrag in `errors.md`). Gemessen `coin/balance` auf 6 fast-Instanzen: 1.200 und
1.500 req/s 0 Fehler (p95 3-3,7 s, Laptop am Limit), 2.000/2.500 req/s 504 nach 5 s statt 502-Welle (vorher 14-43 % 502).
fast-Instanz gestoppt bei 800 req/s: 9 von 20.000 mit 504 (bis zum DNS-Refresh), p95 142 ms; heavy-Gruppe weg: Suche 504
nach 1 s, schnelle Routen unberuehrt, danach von selbst wieder da.
**Nicht gebaut:** kein Wiederholen nach Connect-Timeout (nginx trennt Connect- und Lese-Timeout dafuer nicht), keine
aktiven Healthchecks.

## 2026-10-24 — feat(notifications): Benachrichtigungen seitenweise
**Was:** Audit B7. `GET /notifications` liefert `{ data, nextCursor }`, 100 je Seite, ungelesene zuerst, dann neueste
(Cursor: is_read + `created_at::text` + ID). Glocke nimmt die erste Seite, Seite /notifications hat „Weitere laden“
(`notifications.loadMore`, 9 Sprachen), Store bekommt `appendNotifications`. Geprueft mit 230 Test-Eintraegen auf 40
Zeitstempeln: 3 Seiten, alle eindeutig, 154 ungelesen wie in der DB, Reihenfolge korrekt; Testdaten danach geloescht.
**Nicht gebaut:** kein Gesamtzaehler vom Server (Ungelesen-Zaehler exakt bis 100), Konversationsliste nicht paginiert
(nicht Teil der Entscheidung, waechst pro User langsam). Im Browser nicht durchgeklickt.

## 2026-10-24 — feat(admin): Owner-Transaktionen seitenweise
**Was:** Audit B7 / N1. `admin/owner/coin-transactions` und `cash-transactions` liefern `{ data, nextCursor }`, 200 je
Seite, neueste zuerst (Cursor: `created_at::text` + ID). Owner-Tab „Coins & Cash“ mit „Weitere laden“. Geprueft:
Coin 59 Seiten = 11.776 Zeilen = DB, Cash 18 Seiten = 3.595 = DB, alle eindeutig; erste Seite 39 KB statt 1,97 MB.
Frontend-Typecheck gruen. Beobachtet: Neustart der ganzen heavy-Gruppe auf einmal → heavy-Routen kurz 502
(`no live upstreams`), schnelle Routen unberuehrt; Gruppen einzeln neu starten.
**Nicht gebaut:** keine Suche auf dem Server (Tab-Suche filtert nur geladene Zeilen, Zaehler ebenso), kein Index auf
`created_at` (Migration). Im Browser nicht durchgeklickt.

## 2026-10-24 — feat(chat): Chat-Verlauf seitenweise
**Was:** Audit B7. `GET /chat/conversations/:id/messages` liefert `{ data, nextCursor }`, die neuesten 50 aufsteigend;
`?before=` laedt aeltere. Cursor mit exaktem `sent_at::text`, Sortierung auf der rohen Spalte (Index greift);
Gelesen-Markierung nur fuer die neueste Seite. Chat-Seite: „Aeltere Nachrichten laden“ oben (`chat.loadOlder`, 9
Sprachen), ohne Sprung ans Ende; Beef-Erstellung nimmt die neueste Seite. Geprueft mit 159 Nachrichten (43 teilen sich
ihre Millisekunde): 4 Seiten, alle eindeutig, aufsteigend; Frontend-Typecheck gruen. Testdaten: 130 Nachrichten
„pagetest N“ in einem Loadtest-Chat (makima).
**Nicht gebaut:** kein Infinite Scroll, Care-Chat (`care/clients/:id/conversations/:id/messages`) unveraendert. Im
Browser nicht durchgeklickt.

## 2026-10-24 — feat(search): Profilsuche seitenweise
**Was:** Audit B2. `GET /profile/search` liefert `{ data, nextCursor }` mit 30 Profilen, zuletzt Aktive zuerst
(Keyset auf `last_active_at` in ms + Profil-ID), Fotos/Interessen/Verbindungsstatus nur fuer diese 30. Discover-Seite
zeigt „Weitere laden“ (`discover.loadMore` in 9 Sprachen) und setzt mit den Filtern der letzten Suche fort. Geprueft:
alle 169 Seiten ergeben 5.043 eindeutige Profile (= alle passenden), Seite 19 KB statt 2,8 MB, 37 ms; kaputter Cursor → 400;
Frontend-Typecheck im Image gruen.
**Nicht gebaut:** kein frei waehlbares `limit`, kein Infinite Scroll, Altersfilter unveraendert. Im Browser nicht
durchgeklickt (kein Frontend im Loadtest-Stack).

## 2026-10-24 — feat(db): Zeitlimit je Instanz-Gruppe per Env
**Was:** Audit Phase 1, S4 in der kleinen Form (Entscheidung 2026-10-24: Env statt DB-Rollen). `DB_STATEMENT_TIMEOUT_MS`
(Default 5 s); Loadtest-Stack: schnelle Instanzen 2 s, heavy 10 s, Worker unveraendert 120 s. In den Containern
geprueft: Replika 2.000 ms, heavy 10.000 ms. Full Load 400 req/s ueber alle 64 Endpunkte nach Phase 1: schnelle Routen
p95 22 ms, 0 Fehler; schwere p95 618 ms, 382 x 503 vom Gate; 0 Timeouts (vor Phase 1: 26-40 % Timeouts).
**Nicht gebaut:** keine DB-Rollen, kein PgBouncer, kein Env fuer den Worker. `XXX_backend_load` bekommt die 2 s erst beim
naechsten Neu-Erzeugen (das seedet neu), bis dahin 5 s.

## 2026-10-24 — feat(loadtest): eigene Instanzen fuer schwere Routen
**Was:** Audit Phase 1, S3 + N2. `XXX_backend_load_heavy` (`BACKEND_HEAVY_REPLICAS`, Default 2) bedient Suche, Deck,
Admin-Listen/-Dashboards, Owner-Transaktionen, Shop-Admin-Listen; nginx mit zwei Upstreams, Timeouts je Klasse (fast 5 s,
heavy 15 s, Login 10 s, Upload 30 s), `max_fails=3 fail_timeout=5s`, `limit_conn` 64 auf heavy und Resolver
(`resolve`, alle 10 s neu). Gemessen mit 6 fast + 2 heavy: 50 Suchen/s plus 400 req/s schnelle Routen → schnelle Routen
p95 25 ms, 0 Fehler (gemeinsame Instanzen: p95 10 s, 14 % Timeouts); Suche ~8,5/s, Rest sofort 503. heavy-Gruppe
gestoppt → Suche 504/502 nach hoechstens 2 s, schnelle Routen p95 18 ms; nach Neustart mit neuen IPs ohne nginx-Neustart
wieder erreichbar.
**Nicht gebaut:** keine Sticky Sessions fuer Socket.IO, keine heavy-Gruppe in Demo-/Tenant-Compose. Die Routenliste in
`nginx-lb.conf` muss von Hand zu `@RouteClass('heavy')` passen.

## 2026-10-24 — feat(ops): Routen-Klassen mit Gate je Instanz
**Was:** Audit Phase 1, S1+S2. `@RouteClass('heavy' | 'auth' | 'upload')` an Suche, Deck, Admin-Listen/-Dashboards,
Owner-Transaktionen, Shop-Admin-Listen, Login/Registrierung/Passwort, Foto- und Audio-Upload; globaler `RouteClassGate`
laesst je Klasse und Instanz hoechstens `GATE_HEAVY` (4), `GATE_AUTH` (8), `GATE_UPLOAD` (2) gleichzeitig zu, darueber
sofort 503 mit `Retry-After: 2`. Test 2/2. Gemessen, 30 Suchen/s neben 300 req/s schnellen Routen: Suche bekommt 215 x
503 sofort statt zu warten, die schnellen Routen bleiben aber bei p95 10 s (14 % Timeouts), weil die laufenden Suchen den
Event-Loop der gemeinsamen Instanzen blockieren. Schutz fuer die schnellen Routen erst mit eigenen Instanzen (naechster Step).
**Nicht gebaut:** keine Klassen-Spalte im Endpunkt-Katalog, keine Metrik, keine Warteschlange vor dem Gate.

## 2026-10-24 — feat(docker): Prod-Ziel im Dockerfile
**Was:** Audit B1, erster Schritt. `docker build --target prod`: `npm ci` → `nest build` → Laufzeit-Stage mit
`npm ci --omit=dev`, `node dist/main` als User `node`, ohne Seeds und Full-Reset; Worker per `node dist/worker`. Dev
bleibt das letzte Ziel und damit Default, alle Compose-Dateien laufen unveraendert. Getestet neben dem Loadtest-Stack:
bereit nach 3,9 s, 99 MiB (Dev ~800 MiB), `/ready` ok, Request 200, Stopp 440 ms, Image 491 MB statt 857 MB.
`.env` ist (per `.dockerignore`) nicht im Image, Prod braucht die Werte von aussen (`env_file`/Secrets).
**Nicht gebaut:** keine Compose-Datei nutzt `prod`, kein Migrations-Dienst, Demo-Reset weiter im Dev-Entrypoint
(Entscheidung 2026-10-24: erst nur das Ziel bauen).

## 2026-10-24 — feat(ops): sauberer Shutdown, Keep-Alive ueber dem Proxy, Readiness mit DB und Redis
**Was:** Audit B10. `enableShutdownHooks()` (vorher ignorierte node als PID 1 SIGTERM und wurde nach 10 s hart beendet),
ab SIGTERM `Connection: close` auf jeder Antwort, damit Proxy-Verbindungen frei werden; `keepAliveTimeout` 65 s.
`GET /ready` (ungeprefixt): DB weg → 503, Redis weg → 200 `degraded`, je hoechstens 500 ms; Loadtest-Compose prueft
darauf. Gemessen bei 300 req/s mit POST/PUT: Neustart einer Replika 10,8 s → meist 0,8 s (einmal 5 s), 1 von 4
Neustarts traf noch einen POST (502, vorher ebenfalls 1 von 1).
**Nicht gebaut:** kein Abmelden beim Load Balancer vor dem Stopp (noetig fuer 0 × 502 bei POST, nginx OSS hat keine
aktiven Healthchecks); `XXX_backend_load` nutzt den neuen Healthcheck erst beim naechsten Neu-Erzeugen (das seedet neu).

## 2026-10-24 — fix(media): Upload-Grenze beim Einlesen, Medien gestreamt ausliefern
**Was:** Audit B6. Profilfoto-Upload begrenzt schon im Interceptor auf 5 MB (vorher erst nach dem kompletten Einlesen
im Service), `serveFile` streamt das S3-Objekt mit `Content-Length`, `ETag` und `Cache-Control: public, max-age=3600`,
fehlender Schluessel → 404. Live: 6-MB-Datei → 413, Testfoto → 201, `profiles/admin1.png` 630 KB gestreamt.
**Nicht gebaut:** keine Zugriffspruefung im Media-Proxy (`need to fix.txt` Punkt 1, aendert wer Bilder sieht), keine
signierten URLs, kein CDN; Speichervorteil nicht gemessen.

## 2026-10-24 — fix(coin): Buchungen in der aeusseren Transaktion
**Was:** Audit B8. `addCoins`/`spendCoins`/`ensureBalance` nehmen einen optionalen `EntityManager`; `BeefResolutionService`
uebergibt seinen, damit Beef-Abschluss und Auszahlungen gemeinsam committen oder zurueckrollen und nur eine
Pool-Verbindung belegen. Integrationstest `coin.integration.spec.ts` (nur mit `COIN_IT_DB`): 2/2; gegen den alten Code
schlaegt der Rollback-Fall fehl (7 Coins blieben gebucht).
**Nicht gebaut:** Beef eroeffnen/annehmen/voten/kommentieren buchen weiter ohne aeussere Transaktion (dort kein
Verschachteln, aber auch nicht atomar mit dem Beef-Update).

## 2026-10-24 — fix(errors): DB-Konflikte als 409, abgebrochene Abfragen als 503
**Was:** Audit B5. `HttpExceptionFilter` ordnet `QueryFailedError` zu: 23505/23503 → 409, 57014 (statement_timeout) → 503
mit `Retry-After: 2`; bei echten 500 wird der Stack geloggt. Test 5/5.
**Nicht gebaut:** keine Request-ID, 4xx weiter auf ERROR (beides Audit B11). Gefunden, nicht angefasst: 3 Tests sind schon
vorher rot (`tictactoe.handler.spec.ts` 2x Serienwertung, `demo-seed-path.spec.ts` Nickname in `demo-relations.yaml`).

## 2026-10-24 — fix(db): Zeitlimit fuer Abfragen und offene Transaktionen
**Was:** Audit B9. Pro Verbindung `statement_timeout` 5 s und `idle_in_transaction_session_timeout` 10 s (API), Worker
120 s / 60 s, ueber die node-postgres-Optionen in `extra` statt Migration. Gegenprobe im Container: `pg_sleep(6)`
bricht nach 5.005 ms mit 57014 ab; Full Load 250 req/s ohne einen einzigen Abbruch.
**Nicht gebaut:** keine getrennten DB-Rollen je Routen-Klasse (Phase 1, Migration), kein PgBouncer, Werte nicht per Env.

## 2026-10-24 — fix(redis): Timeouts und fail-open, Redis-Ausfall legt die API nicht mehr lahm
**Was:** Audit B16 (Eintrag in `errors.md`). Gegenprobe: Redis 12 s pausiert waehrend 300 req/s auf vier eingeloggten
Endpunkten: 9.000 Requests, 0 Fehler, p95 26 ms, alle 5 s eine Spitze bis ~540 ms (eine Probe pro Prozess). Vorher: 000.
**Nicht gebaut:** kein Circuit Breaker mit Halb-offen-Zustand, keine Metrik, Timeouts nicht per Env; Setup-Versuchszaehler
und Beef-Spielstand bleiben strikt (dort ist Redis echter Zustand).

## 2026-10-24 — fix(notifications,profile): Erst-Anlage sicher bei parallelen Requests
**Was:** Notification-Settings (`ensureSettings`, dann `update`) und `addInterest` legen per `ON CONFLICT DO NOTHING` an
statt Lesen-dann-Anlegen (Eintrag in `errors.md`). Gegenprobe: 100 neue User, 900 req/s, 7.200 Requests, 0 Fehler, je
User genau eine Zeile.
**Nicht gebaut:** kein 23505→409 im Exception-Filter, doppelter UNIQUE-Index auf `user_interests` bleibt (Migration).

## 2026-10-24 — fix(coin): Konto-Anlage sicher bei parallelen Requests
**Was:** `ensureBalance` legt Konto und Startbonus in einer Transaktion per `ON CONFLICT DO NOTHING … RETURNING` an
(Eintrag in `errors.md`). Gegenprobe: 100 neue User, 1.000 req/s, 5.000 Requests, 0 Fehler, je User ein Konto und ein
Startbonus.
**Nicht gebaut:** `addCoins`/`spendCoins` unveraendert (verschachtelte Transaktion, siehe Loadtest-Audit B8), kein Test.

## 2026-10-24 — feat(auth): Loadtest-Modus nur mit passendem Schluessel
**Was:** `isLoadtestRequest` vergleicht `X-Loadtest-Key` zeitkonstant mit `LOADTEST_KEY` (mind. 32 Zeichen). Nur dann:
kein Throttling (globales `skipIf` statt `@SkipThrottle` am Login), Login-Token `LOADTEST_TOKEN_TTL_S` (Default 12 h),
Test-Kauf erlaubt (`LoadtestKeyGuard`, sonst 404). Live gegen den Stack geprueft: ohne Schluessel 429 ab 100/min,
15-min-Token, 404; mit Schluessel alles 200/201, 720-min-Token. Unit-Test 4/4.
**Nicht gebaut:** kein Schluessel-Check fuer WebSockets, keine Rotation, kein Admin-UI dafuer.

## 2026-10-24 — chore: Notiz „need to fix.txt“ einchecken
**Was:** Offene Funde vom 2026-10-22 (Media-Proxy ohne Login, totes Socket-Event im Reaktionsspiel u. a.), bisher nur lokal.
**Nicht gebaut:** kein Umzug nach `docs/`, keine Fixes daraus.

## 2026-10-24 — feat(loadtest): Load Balancer mit Backend-Replikas, Skripte dafuer angepasst
**Was:** nginx (`XXX_lb_load`, `scripts/loadtest/nginx-lb.conf`) auf :3100 vor `XXX_backend_load` und
`BACKEND_REPLICAS` weiteren Instanzen (`node dist/main`), weil eine Instanz der Engpass war. Dashboard zeigt die
Replikas, „Backend zuruecksetzen“ erzeugt sie mit; Kontaktanfragen gehen an Pool-User (sonst keine Chats), Admin-Aktionen
mit eigenem Admin-Token, Tokens aelter als 5 min werden neu geholt. Stand vom 2026-10-22, im Repo bisher nicht committet.
**Nicht gebaut:** kein Socket.IO-Adapter, Crons laufen weiter in jeder Instanz (siehe Kommentar in der Compose-Datei).

## 2026-10-19 — fix(shop-demo): Reset-Befehl in der Doku
**Was:** Frisch anfangen braucht `docker rm shop_demo_db` vor dem Loeschen des Volumes (Eintrag in `errors.md`).
Danach live gegen die Demo getestet: Premium-Code einloesen → `{kind: premium, amount: 30}`, Abo `code`/`shop` bis
+30 Tage, zweites Einloesen → 409.
**Nicht gebaut:** kein `reset`-Befehl in `shop_demo.sh`.

## 2026-10-19 — chore(shop-demo): Demo-Bestellung mit Premium-Code
**Was:** `seed-orders.ts` legt eine zehnte Bestellung an (gutz, zugestellt, `premium:30`), damit sich Premium-Codes in
der Demo ohne Stripe einloesen lassen. Greift nur bei frischer Demo-DB (Seed ueberspringt vorhandene Bestellungen).
**Nicht gebaut:** kein eigenes Testskript, kein Nachtragen in bestehende Demo-DBs.

## 2026-10-19 — fix(payment): Enum payment_provider kennt 'stripe'
**Was:** Migration `009_payment_provider_stripe.sql` (auch im DB-Image). Vorher scheiterte der Insert in `subscriptions`
nach jedem Stripe-Checkout, Premium-Kaeufe wurden nie freigeschaltet. Gegenprobe: Insert ohne 009 → Fehler, mit 009 → ok.
**Nicht gebaut:** kein Umbau von `PaymentService`, keine Nachbuchung alter, gescheiterter Kaeufe (Stripe stellt
fehlgeschlagene Webhooks bis zu 3 Tage erneut zu).

## 2026-10-19 — feat(shop): Premium-Codes schalten Premium direkt frei
**Was:** `premium:<Tage>`-Codes loesen jetzt ein. `PremiumUnlockProvider` (payment) meldet `unlock('premium')` beim
Broker an und legt eine Zeile in `subscriptions` an (plan `code`, Anbieter `shop`, `provider_subscription_id` =
Idempotency-Key). Mehrere Codes stapeln sich ab dem letzten Ablauf; pro User per Advisory-Lock nacheinander.
Migration `008_premium_codes.sql` (Enum-Werte + eindeutiger Index auf den Key), auch im DB-Image. Frontend zeigt
„Premium fuer N Tage freigeschaltet“ in allen 9 Sprachen. Integrationstest: zwei Codes → 30 und 60 Tage, gleicher
Key nochmal → keine dritte Zeile. 7/7 gruen.
**Nicht gebaut:** Premium verschenken, Stripe-Tests, Body-Limit, Matching ueber Broker. Gefunden, nicht angefasst:
`PaymentService` schreibt `payment_provider = 'stripe'`, das Enum kennt den Wert nicht.

## 2026-10-19 — fix(shop): Seed-Titel passen zum Freischalt-Ziel
**Was:** `seed-shop.ts` waehlt bei Freischalt-Artikeln erst das Ziel und leitet den Namen davon ab (`premium:*` →
„Premium-Pass“, `coins:*` → „Coin-Paket“). Titel und Beschreibung nutzen dasselbe Nomen. Vorhandene Demo-Daten bleiben
(`ON CONFLICT DO NOTHING`); neu anlegen mit `scripts/shop_demo.sh down && docker volume rm shop_demo_pgdata`.
**Nicht gebaut:** Premium per Code, Stripe-Tests, Body-Limit, Matching ueber Broker (warten auf Entscheidung).

## 2026-10-12 — docs/test(shop): Modul-Doku + Integrationstest — Shop Schritt 12
**Was:** `docs/shop.md` fasst das Modul an einer Stelle zusammen (Ablauf, Status, Regeln + Einstellungen,
Broker-Vertraege, Auslieferung, Erstatten/Sperren/Faelle, Alarme/Cron, Rechnungen, Endpunkte, Demo/Tests).
`shop.integration.spec.ts` spielt mit den echten Services gegen echtes Postgres durch: Kasse → Webhook → System nimmt
an (Key, Code, Rechnung, Code einloesen) · ueber 150 € angehalten → Mensch nimmt an → Bestand 0 → Kasse abgewiesen →
Lieferstand → zugestellt · Erstattung im Admin + im Dashboard (nichts doppelt, Nummern 1–4 ohne Luecke) · Rueckbuchung
doppelt gemeldet → ein Fall · Kaeufer mit Rueckbuchung → angehalten → Erinnerung einmal → verfallen → Stripe-Aufhebung
danach aendert nichts · abgebrochene Kasse unsichtbar. Ersetzt: Stripe, Mail, Socket, Queue. `scripts/shop_test.sh`
legt dafuer jedes Mal `yb_shoptest` frisch an (Demo-Container, alle Migrationen); ohne `SHOP_IT_DB` wird uebersprungen.
6/6 gruen, zweimal hintereinander.
**Nicht gebaut:** Browser-Tests als feste Suite, Lasttests, Controller-/Routing-Tests.

## 2026-10-12 — fix(shop): Bestand beim Annehmen herunterzaehlen
**Was:** Luecke aus Schritt 5: Bestand (Essen/Merch) wurde nie verringert. `checkAvailability` (vorher `checkKeys`)
prueft vor dem Abbuchen Keys und Bestand (gleiche Artikel ueber Positionen summiert, NULL = unbegrenzt) → Admin 409,
System haelt an mit `out_of_stock`. `onApproved` zieht in der Annahme-Transaktion ab (`FOR UPDATE`), nie unter 0;
zwei Kaeufer, letztes Stueck → nach dem Abbuchen scheitert nichts mehr, Protokoll `stock_short` mit fehlender Menge.
Geprueft gegen die Demo-DB (Bestand 2: A mit 2×1 → ok, B danach abgewiesen, erzwungen → Bestand 0 + `stock_short`;
Testdaten danach entfernt). 169 Tests gruen.
**Nicht gebaut:** Bestand zurueckbuchen bei Erstattung/Ablehnung, Bestand schon beim Reservieren blocken, Warnung bei
niedrigem Bestand.

## 2026-10-12 — feat(shop): Stripe-Webhook + Risiko-Regeln, automatische Annahme — Shop Schritt 5
**Was:** Vertrag im `ModuleBroker` (vom User freigegeben): neutrale `PaymentEvent`s (authorized mit Radar/Karte/
Rechnungsadresse, canceled, checkout_expired, refunded, dispute_opened/closed), `handlePaymentEvents(kind, handler)` /
`dispatchPaymentEvent`. `PaymentService.handleWebhook` prueft die Signatur, uebersetzt in `payment-events.ts`
(`toPaymentEvent`: Charge/PaymentIntent/Refunds nachschlagen, Events ohne `metadata.kind` laufen wie bisher in den
Abo-Zweig) und reicht ueber den Broker weiter; wirft der Empfaenger, antwortet der Webhook mit Fehler (Stripe stellt neu zu).
Shop: `ShopPaymentEventsService` meldet sich fuer `shop` an und verteilt. `ShopIntakeService`: reserviert → Zahlungsdaten
speichern, Risiko-Regeln (`shop-risk.ts`, Fakten aus `ShopRiskService`, Schwellen als Systemeinstellungen
`shop_hold_*`/`shop_decide_minutes_*`, Standard: ab 150 €, erste Bestellung ab 50 €, ≥3/Std., Karte bei ≥2 anderen
Konten in 30 Tagen, fruehere Rueckbuchung/Meldung, Radar erhoeht/hoch; Betrag ≠ reserviert immer anhalten) → anhalten
(Frist Essen 30 Min., sonst 24 Std., Alarm `order_held` mit Mail) oder das System nimmt an (`approveBySystem`: gleicher
Weg wie der Mensch aus `authorized`, decided_by NULL). Scheitert die Annahme (Stripe, Keys fehlen, sonstiges) → anhalten
mit Grund. Cron haelt Reservierungen an, die 5 Min. haengen. Stripe hebt Reservierung auf → `expired` (eigene Aufhebungen
sind schon abgelehnt/verfallen → nichts). Kasse abgelaufen → `cancelled`. Erstattungen aus dem Stripe-Dashboard →
`applyExternal` (eigene erkennt das Protokoll an der Refund-ID, Zeilensperre wartet auf laufende eigene Erstattung),
Stornorechnung. Rueckbuchung → dringender interner Fall `dispute` (einmal pro Dispute, Frist 48 Std., Alarm + Mail),
Ausgang als interne Notiz. Kaeufer-Mails: Eingangsbestaetigung (§ 312i, noch keine Annahme), Ablehnung, Verfall.
Unit-Tests: `@nestjs/bullmq` (ESM) per `moduleNameMapper` auf `test/stubs/nestjs-bullmq.ts`, statt Mocks pro Spec.
168 Tests gruen (shop/shared/payment/tenant). Im Gesamtlauf scheitern `demo-seed-path.spec` und
`tictactoe.handler.spec` — auch ohne diese Aenderungen, nicht angefasst.
Geprueft im Demo-Stack mit signierten Webhooks an den echten Endpunkt: unauffaellig → System will abbuchen → Stripe-
Platzhalter → angehalten „Abbuchen fehlgeschlagen“; doppeltes Event → nichts; 220 € erste Bestellung → angehalten
(hoher Betrag, erste Bestellung); Kasse abgelaufen → abgebrochen; Stripe hebt auf → verfallen (doppelt → einmal);
Abo-Event ohne kind → alter Zweig; Panel zeigt Gruende und „System“.
**Nicht gebaut:** eigene Scores/ML, Regeln in der Oberflaeche, automatisches Ablehnen, Beweise zur Rueckbuchung
einreichen (Stripe-Dashboard), Kaeufer-Mails in anderen Sprachen, Erfolgsweg mit echtem Stripe (Zahlungstests am Schluss).

## 2026-10-11 — feat(shop): Rechnungen + Stornorechnungen — Shop Schritt 8
**Was:** Rechnung entsteht bei der Annahme (Entscheidung des User: Vertrag + Abbuchung), Stornorechnung je Erstattung.
API reiht nach dem Commit einen Job in `shop-invoice` ein (`ShopInvoiceService.enqueue`, Fehler dort brechen Annahme/
Erstattung nie ab). `ShopInvoiceProcessor` (nur im WorkerModule): in einer Transaktion Bestellung sperren, Nummer aus
`shop_invoice_counters` (pro Jahr, Berlin, `RE-`/`ST-` teilen sich den Zaehler — keine Luecken, weil Nummer, PDF und
Zeile zusammen committen), PDF mit pdfkit (`shop-invoice-pdf.ts`, § 14 UStG: Verkaeufer aus `tenant.json` legal inkl.
USt-IdNr./Steuernummer, Empfaenger, Nummer, Datum, Leistungsdatum bzw. Kalendermonat, Positionen, Netto/MwSt je Satz),
Zeile in `shop_invoices` + Protokoll `invoice_issued`. Danach Mail mit PDF-Anhang (Stripe-Mail, sonst Konto-Mail),
`sent_at`; scheitert die Mail, wiederholt BullMQ (Beleg wird nicht neu erzeugt), Fehlschlaege stehen im Worker-Log.
Rechnen in `shop-invoice.ts`: MwSt aus brutto je Satz, Versand anteilig auf die Saetze, Storno anteilig wie die
Rechnung (groesster Rest, Summen auf den Cent), Positionen ≠ Gesamt → Fehler statt falscher Rechnung. Storno ohne
Rechnung legt die Rechnung zuerst an; Refund-ID macht Stornos idempotent. Endpunkte: Kaeufer `GET orders/:id/invoices`,
`GET invoices/:id/pdf` (nur eigene); Admin `GET invoices/:id/pdf`, `POST orders/:id/invoices` (anlegen falls fehlt +
erneut senden); Bestell-Detail liefert `invoices`. Keine Migration. 133 Tests gruen (shop/shared/tenant).
Specs mit `ShopInvoiceService` im Import mocken `@nestjs/bullmq` (ESM, Jest laedt es nicht).
Geprueft im Demo-Stack (jetzt mit Worker): 4 Rechnungen RE-2026-000001…4 ueber den Admin-Endpunkt, `held` → 409,
Resend-Platzhalter → 3 Versuche, „aufgegeben“ im Log, `sent_at` bleibt leer; Stornorechnung mit echtem Code gegen die
Demo-DB (zweimal → eine), PDFs gerendert und angesehen.
**Nicht gebaut:** EU-OSS/Reverse Charge/Kleinunternehmer, Rechnungen in anderen Sprachen, USt-ID von Firmenkunden,
Layout/Logo pro Mandant, DATEV-Export. Erstattungen von vor diesem Schritt haben keine Stornorechnung (Demo).

## 2026-10-11 — feat(shop): Alarme + Nachfass-Cron — Shop Schritt 6c
**Was:** Neues typisiertes Event `shop.alert` (`AppEvents.shopAlert`, Arten case_opened/case_reply/not_met/case_overdue/
decide_soon/expired), `ChatGateway` leitet es an den Socket-Raum `admin` weiter (Vertrag vom User freigegeben).
`ShopAlertService.send`: immer Socket, bei Dringendem (nicht angetroffen, Frist laeuft in 30 Min. ab, Fall ueber der
Frist) zusaetzlich Mail an alle Admins/Owner (`MailService.sendShopAlertEmail`, nur Nummer + Link, keine Kaeuferdaten;
Resend-Fehler werden erkannt und geloggt, brechen nichts ab). Ausgeloest: Kaeufer meldet Problem / antwortet (Antwort
gibt dem Team eine neue Frist), „nicht angetroffen“ erst nach dem Commit. `ShopFollowUpService` (jede Minute, Laeufe
stapeln sich nicht): Erinnerung 30 Min. vor `decide_by` (einmal, Eintrag `reminder` im Protokoll), nach der Frist
Reservierung aufheben (Stripe cancel ueber den Broker, Key `shop-expire-<id>`) → `expired` + Protokoll; Stripe-Fehler →
bleibt angehalten, `stripe_error` nur einmal; Faelle beim Team ueber der Frist → Alarm, danach erneut alle 30 Min.
(dringend) / 2 Std. (hoch) / 4 Std. (`last_alert_at`). `GET /admin/shop/attention` (angehalten, Faelle beim Team,
davon dringend). Keine Migration. 82 Tests gruen (+9).
Geprueft im Demo-Stack: Cron gegen echte Daten (Stripe-Platzhalter → bleibt angehalten, Fehler einmal; ueberfaelliger
Fall → Alarm, Mail-Fehler „2 von 2 nicht gesendet“ geloggt), echter Cron-Code gegen die Demo-DB mit Stripe-Attrappe
(verfallen, Erinnerung nur einmal ueber zwei Laeufe).
**Nicht gebaut:** Telegram/SMS, Alarm nur an zustaendige Admins (`assigned_to`), Eintraege in `admin_tickets`,
Alarm „neue Bestellung angehalten“ (kommt mit dem Webhook in Schritt 5), Alarme pro Admin abschalten, Sperre gegen
parallele Cron-Laeufe auf mehreren Instanzen (ein Backend pro Mandant).

## 2026-10-11 — feat(shop): Erstatten + Shop-Sperre — Shop Schritt 6b
**Was:** Vertrag im `ModuleBroker` erweitert (vom User freigegeben): `PaymentGateway.refund(paymentIntent, betragCent,
idempotencyKey) → { refundId }`, `StripePaymentGateway` ruft `stripe.refunds.create`. `ShopRefundService`:
`POST /admin/shop/orders/:id/refund { amountCents, note, revokeCodes? }` nur aus approved/fulfilled/partially_refunded,
hoechstens der noch offene Betrag, Begruendung Pflicht. Zeilensperre (`FOR UPDATE`) ueber den Stripe-Aufruf, damit zwei
Admins nicht doppelt erstatten; Idempotency-Key `shop-refund-<id>-<erstattet vorher>-<betrag>` (Wiederholung nach Absturz
erstattet nicht nochmal). Voll → `refunded` und alle noch nicht eingeloesten Keys/Codes gesperrt; teilweise →
`partially_refunded`, Codes nur mit Haekchen (Entscheidung des Users). Eingeloeste Codes bleiben, die Zahl steht im
Protokoll (`refunded` mit Betrag, Grund, Refund-ID). Stripe-Fehler: nichts geaendert, `stripe_error` bleibt im Protokoll
(ausserhalb der zurueckgerollten Transaktion), 502. Lieferstand laeuft nach Teil-Erstattung weiter (Status bleibt
`partially_refunded`). Shop-Sperre: `PUT /admin/shop/blocks/:userId { reason, days? }` (ohne days unbefristet, nochmal
sperren ersetzt), `DELETE` hebt auf (setzt `until = now()`, Zeile bleibt). Bestell-Detail liefert `buyer_block`.
Kasse prueft die Sperre schon seit Schritt 4 (403). Keine Migration. 73 Tests gruen (12 neu).
Geprueft im Demo-Stack: curl (zu viel 400, ohne Grund 400, held 409, Stripe-Platzhalter 502 + Protokoll, Sperre →
Kasse 403, doppelt aufheben 404) und der echte Service gegen die Demo-DB mit Stripe-Attrappe (voll: Key gesperrt;
teilweise: Versand → zugestellt, Status bleibt teilerstattet).
**Nicht gebaut:** Stornorechnung (Schritt 8), Coins zurueckbuchen bei schon eingeloesten Codes, Erstattungen/Rueckbuchungen
aus dem Stripe-Dashboard (Webhook, Schritt 5), Teil-Erstattung pro Artikel, Liste aller Sperren, wer eine Sperre aufhob.

## 2026-10-11 — chore(scripts): Shop-Demo mit einem Befehl — scripts/shop_demo.sh
**Was:** Wunsch des Users nach dem Verlust der Wegwerf-Testumgebung (Neustart, `/tmp` + `--rm`-Container weg):
`scripts/shop_demo.sh up|down` wie `demo.sh`. Eigener Stack (Postgres/Redis/Frontend als Container mit festem Volume
und `--restart unless-stopped`, Backend + Auto-Login-Proxy auf dem Host), Migrationen per psql mit eigener
Buchfuehrung (`shop_demo_migrations`), DB selbst angelegt wie `tenant-init.ts` (POSTGRES_DB bekaeme vom postgis-Image
schon die Extensions aus der Baseline). Seeds: Demo-User, 1000 Artikel, `scripts/shop-demo/seed-orders.ts`
(Bestellungen in allen Zustaenden ueber den echten `ShopFulfillmentService`). Zustand in `.shop-demo/` (gitignored).
Geprueft: frisches `up` (Volume neu), Shop/Bestellungen/Admin im Browser ohne Fehler, `down` + zweites `up` legt
nichts doppelt an.
**Nicht gebaut:** `reset`/`logs`-Befehle (frisch anfangen = Volume loeschen, steht im Kopf des Skripts), Stripe-Anbindung.

## 2026-10-11 — feat(shop): Faelle — Problem melden, Kaeufer melden — Shop Schritt 9 (Backend)
**Was:** `ShopCasesService` auf den Tabellen aus 007. Kaeufer: `POST /shop/orders/:id/cases` (Grund aus
`PROBLEM_REASONS`, Beschreibung 10–2000 Zeichen, nur eigene Bestellung, nicht bei abgebrochener Kasse, eine offene
Meldung pro Bestellung — sonst 409), `GET /shop/orders/:id/cases` (Verlauf ohne interne Notizen),
`POST /shop/cases/:id/messages` (Antwort; Fall geht von „wartet“ zurueck auf „offen“). Team unter `/admin/shop`:
`GET cases` (aktiv/offen/wartet/erledigt, dringend zuerst, dann nach Frist), `GET cases/:id`, `POST cases/:id/messages`
(oeffentlich → Kaeufer ist dran, oder interne Notiz; Meldungen gegen Kaeufer sind immer intern),
`POST cases/:id/resolve` (Ergebnis Pflicht), `POST orders/:id/report` (Kaeufer melden: nicht angetroffen, Missbrauch,
Betrugsverdacht — intern). Lieferstand „nicht angetroffen“ oeffnet in derselben Transaktion einen dringenden Fall
(Frist 2 Std.). Jeder neue Fall steht im Bestell-Protokoll (`case_opened`); Bestell-Detail im Admin zeigt die Faelle
und in der Vorgeschichte die Meldungen gegen den Kaeufer. 60 Tests gruen.
Gegen den neuen Demo-Stack per curl: zweite Meldung 409, oeffentliche Antwort → wartet, interne Notiz fuer den Kaeufer
unsichtbar, Kaeufer antwortet → offen, nicht angetroffen → dringender Fall, Meldung, abschliessen, danach keine
Antwort mehr (409), fremde Bestellung 404.
**Nicht gebaut:** Shop-Sperre, Alarme (Socket/Mail, `admin_tickets`), Nachfass-Cron fuer `due_at`, Stripe-Disputes,
Anhaenge. Frontend folgt im naechsten Commit.

## 2026-10-11 — feat(shared): Vermittlung zwischen Modulen + Codes einloesen — Shop Schritt 7b
**Was:** Wunsch des Users: Module reden nur ueber einen Vermittler, nie direkt, damit man sie leichter an- und
abstecken kann. `ModuleBroker` in `shared/` (global): Anbieter melden sich beim Start an, Nutzer fragen dort nach;
ohne Anbieter gibt es `ModuleUnavailableError`. `PaymentModule` meldet `StripePaymentGateway` an (Checkout mit
Reservierung, capture, cancel), `CoinModule` meldet `coins` an (`addCoins` Typ `purchase` — Coins sind im Shop
gekauft, kein neuer CHECK-Wert noetig). Shop importiert nichts mehr aus `payment/`. `POST /shop/redeem`
(20/Std.): Code normalisieren (Gross/klein, Leerzeichen, Striche egal), nur verkaufte Codes einer angenommenen
Bestellung; erst Code reservieren (`UPDATE … WHERE redeemed_at IS NULL`), dann gutschreiben mit Idempotenz-Key
`shop-code-<id>`; scheitert die Gutschrift, wird der Code wieder frei. Kein Anbieter (Coins aus, Premium noch gar
nicht) → 503 „bleibt gültig“, Code unverbraucht. Protokoll-Eintrag `redeemed`. 55 Tests gruen.
Gegen die Wegwerf-DB: Mandant mit `hidden: false` → 503, Code unverbraucht; `hidden: true` → 500 Coins gutgeschrieben,
zweites Mal 409, falscher Code 404, Lizenz-Key 404.
**Nicht gebaut:** Premium per Code (entschieden: erst nur Coins, Premium-Modell spaeter), Umbau Matching→Payment,
Codes zuruecksetzen durch Admins. **Gefunden, nicht behoben:** `seed-shop.ts` waehlt Titel und `unlock_target`
unabhaengig — „Coin-Paket“ kann `premium:30` sein und „Premium-Pass“ `coins:2000`.

## 2026-10-11 — feat(shop): Auslieferung nach der Annahme — Shop Schritt 7a
**Was:** `ShopFulfillmentService`: vor dem Abbuchen prueft `checkKeys`, ob genug freie Lizenz-Keys da sind (sonst 409,
kein Geld genommen). In der Transaktion der Annahme teilt `onApproved` Keys zu (`FOR UPDATE SKIP LOCKED`) und erzeugt
Freischalt-Codes (`XXXX-XXXX-XXXX`, ohne 0/O/1/I, verschluesselt + HMAC-Hash). Digitale Bestellungen sind damit
`fulfilled`, Essen/Versand starten bei `progress = accepted`. Reicht es beim Zuteilen doch nicht (Wettlauf), rollt die
Annahme zurueck; nochmal annehmen bucht dank Idempotency-Key nicht doppelt ab. `POST /admin/shop/orders/:id/progress`:
nur vorwaerts, Schritt muss zur Lieferart passen (`progressError`), „nicht angetroffen“ nur bei Essen ab fertig/unterwegs,
`delivered` → `fulfilled`, Sendungsnummer bei `shipped`, jeder Schritt im Protokoll. Kaeufer: `GET /shop/orders`
(ohne abgebrochene Kassen) und `GET /shop/orders/:id` (nur eigene, sonst 404; Keys/Codes entschluesselt erst nach der
Annahme, ohne zurueckgerufene; interne Notiz und Risiko-Gruende nicht dabei). Stripe-Ruecksprung jetzt mit `?placed=1`.
47 Tests gruen. Gegen die Wegwerf-DB: Auslieferung direkt ueber den Service (Stripe hat nur den Platzhalter-Key) —
3 Keys zugeteilt, 1 Code erzeugt; Fortschritt vorwaerts/rueckwaerts/falsche Art/digital per curl; fremde Bestellung 404.
**Nicht gebaut:** Einloesen der Codes in der App (`/shop/redeem`, Schritt 7b — braucht Coin/Premium, also einen Vertrag
zwischen Modulen), Mails an den Kaeufer (Schritt 8), Rueckruf von Keys/Codes bei Erstattung, Tracking-Links.

## 2026-10-11 — feat(shop): Bestellungen fuer Admins entscheiden — Shop Schritt 6 (Teil 1)
**Was:** `ShopOrdersAdminService` unter `/admin/shop/orders` (gleiche Guards wie die Artikelpflege):
`GET orders` (Status-Filter, Standard `held`, angehaltene nach Frist sortiert; Suche nach Bestellnummer-Anfang,
Mail, Name, Nickname; Zaehler pro Status), `GET orders/:id` (Positionen, Protokoll mit Nickname, Vorgeschichte
des Kaeufers), `POST orders/:id/approve` (Stripe `paymentIntents.capture`) und `POST orders/:id/reject`
(Begruendung 5–1000 Zeichen, `paymentIntents.cancel`). Beides nur aus `held`, Idempotency-Key pro Bestellung,
Status-Wechsel per `UPDATE … WHERE status = 'held'` (zwei Admins gleichzeitig → der zweite bekommt 409).
Stripe-Fehler → 502, Status bleibt, `stripe_error` im Protokoll. Ohne Reservierung: Ablehnen geht, Annehmen nicht.
Kein neuer Vertrag: nutzt den vorhandenen `StripeService.stripe`, `PaymentService` unangetastet. 40 Tests gruen.
Gegen die Wegwerf-DB mit Testbestellungen per curl: Liste/Detail/Suche, Annehmen → 502 (Platzhalter-Key), leere
Begruendung → 400, Ablehnen ohne Reservierung → `rejected` + Protokoll.
**Nicht gebaut:** Erstatten, Shop-Sperre, Alarme (Socket + Mail), Nachfass-Cron und Ablauf der Frist — die
`held`-Bestellungen entstehen erst mit Schritt 5 (Webhook + Risiko-Regeln). Regel-Codes (`amount_high`, …) sind
bisher nur Anzeige-Labels im Frontend.

## 2026-10-10 — feat(shop): Artikelpflege fuer Admins — Shop Schritt 11
**Was:** `/admin/shop/*` (JwtGuard + RolesGuard `admin`, Owner erbt, Modul `shop`): Liste mit Suche (Titel/SKU),
Art, Status, 50 pro Seite, freie Keys je Lizenz; `POST products` (409 bei doppelter SKU, MwSt nach Art
vorbelegt), `PATCH products/:id` (nur mitgeschickte Felder, `null` leert; SKU und Art fest), `POST products/import`
(CSV mit `;` oder `,`, Probelauf, Fehler pro Zeile mit Excel-Zeilennummer, nichts gespeichert solange ein Fehler
da ist, Update nur der Spalten aus der Datei, Art einer vorhandenen SKU nicht aenderbar), `POST products/:id/codes`
(nur Lizenzen, `encryptField` + HMAC-Hash `hashShopCode`, Doppelte uebersprungen). Regeln fuer Formular und Import
gleich (`productRuleError`: Freischaltung nur bei unlock, Lizenzen ohne Bestand). Mehrdeutige Preise wie „12,345“
werden abgelehnt statt geraten. 34 Tests gruen.
Gegen Wegwerf-DB per curl geprueft: normaler User 403, anlegen/doppelt/Regeln/fremde Felder, PATCH, Import
Probelauf → echt → Art-Konflikt schreibt nichts, Keys (3 neu, 1 doppelt, Merch → 400), Lizenz danach im Shop
lieferbar, Keys in der DB ohne Klartext.
**Nicht gebaut:** kein Loeschen (Artikel haengen an Bestellungen — dafuer „ausblenden“), kein Bild-Upload, keine
Varianten, kein Audit-Log fuer Artikelaenderungen. CSV hoechstens 95 000 Zeichen und 2000 Keys pro Aufruf, weil
Express JSON nur bis 100 KB annimmt und `main.ts` das Limit global setzt (nicht angefasst).

## 2026-10-10 — feat(shop): GET /shop/settings — Shop Schritt 10b
**Was:** Liefert `shipping_cents`, damit Warenkorb und Kasse die Versandpauschale vor der Bestellung zeigen
(PAngV). Gleicher Wert wie im Checkout, Standard `SHOP_SHIPPING_CENTS_DEFAULT` (490) an einer Stelle.
**Nicht gebaut:** keine weiteren Einstellungen (Oeffnungszeiten, Liefergebiet).

## 2026-10-10 — feat(shop): Artikelliste zeigt Lieferbares zuerst — Shop Schritt 10a
**Was:** `buildProductFilter` setzt die Lieferbarkeit vor die gewaehlte Sortierung, damit ausverkaufte Artikel
(z. B. Lizenzen ohne Keys) nicht zwischen den kaufbaren stehen. Frontend dazu siehe `frontend/docs/build-log.md`.
**Nicht gebaut:** kein eigener Index dafuer (6–24 ms bei 1000 Artikeln).

## 2026-10-10 — feat(shop): Checkout mit Reservierung — Shop Schritt 4
**Was:** `POST /shop/checkout` (20/h): Warenkorb gegen die DB geprueft (Preise nie vom Client, doppelte Positionen
zusammengezaehlt, Bestand bzw. freie Keys, eine Lieferart pro Bestellung, Pflichtangaben je Lieferart, Wunschzeit
in den naechsten 7 Tagen, digital nur mit Widerrufs-Verzicht), Shop-Sperre → 403. Bestellung + Positionen +
`created`-Event in einer Transaktion, dann Stripe Checkout (`embedded_page`, `capture_method: manual`,
Versandpauschale `shop_shipping_cents` als eigene Zeile, Rechnungsadresse Pflicht). Stripe-Fehler → `cancelled`,
`stripe_error`-Event, 503. Fehlerpfad gegen Wegwerf-DB geprueft; die echte Stripe-Session nicht, weil `.env`
nur einen Platzhalter-Key hat (steht in `nextStep.md` unter „Noch zu testen“).
**Nicht gebaut:** kein gemischter Warenkorb, keine Bestands-Reservierung beim Checkout, kein `GET /shop/orders`,
keine Eingangsbestaetigung (kommt mit dem Webhook in Schritt 5).

## 2026-10-10 — chore(docs): ShopSession.md — Übergabe für die Shop-Arbeit
**Was:** Stand, Entscheidungen, Arbeitsweise (workmode) und Test-Setup an einer Stelle, damit eine neue Session
ohne Vorwissen weitermachen kann. Plan/Schema bleiben in `nextStep.md`.
**Nicht gebaut:** keine Kopie des Plans, keine Automatik zum Aktualisieren.

## 2026-10-10 — feat(shop): Artikel-API mit Filtern und Bewertungen — Shop Schritt 3
**Was:** `GET /shop/products` (Suche, Kategorie, Art, Preisspanne, Mindestbewertung, lieferbar, 4 Sortierungen,
Seiten bis 60) mit Facetten fuers Filter-Panel, `GET /shop/products/:id` mit Bewertungen und `can_review`,
`POST /shop/products/:id/reviews` (nur Kaeufer, nochmal bewerten ueberschreibt). Sortierung nur aus fester
Liste, `%`/`_` in der Suche sind Text. Gegen Wegwerf-DB mit 1000 Artikeln geprueft: 2–12 ms pro Liste.
**Nicht gebaut:** kein Caching, keine Volltextsuche (Trigram-ILIKE reicht), keine Cursor-Pagination
(Offset reicht bei 1000), kein Loeschen einer Bewertung.

## 2026-10-09 — fix(mail): Reset-Link zeigt auf /reset-password
**Was:** `sendPasswordResetEmail` baute `${APP_URL}/auth/reset-password` — im Frontend gibt es kein
`/auth`-Praefix, der Link war 404. Seite dazu siehe `frontend/docs/build-log.md`.
**Nicht gebaut:** keine i18n/Branding der Mail (Text sagt weiter „Paarship“).

## 2026-10-07 — fix(console): „Mandant neu starten“ auch nach Logo-Upload
**Was:** Das Backend liest `tenant.json` nur beim Boot — ohne Neustart zeigt die App das neue Logo nicht.
Der Button kam bisher nur nach dem Formular-Speichern.
**Nicht gebaut:** kein automatischer Neustart (bewusst ein Klick, der Mandant ist kurz weg).

## 2026-10-07 — feat(tenant): GET /tenant/asset/:name — Console Schritt 8
**Was:** Liefert Logo/Favicon aus `tenants/<slug>/`, aber nur die zwei in `tenant.json` genannten Dateien
(`.env`, `tenant.json` → 404), mit CSP und 5 min Cache. Frontend-Teil siehe `frontend/docs/build-log.md`.
**Nicht gebaut:** kein Upload im Backend (macht die Console), keine Bildgroessen-Varianten.

## 2026-10-07 — feat(console): Logo-Upload mit Favicon — Console Schritt 7
**Was:** Im Editor Logo per Klick oder Drag & Drop; Vorschau auf hellem und dunklem Grund, Logo auch auf
der Uebersichtskachel. Upload speichert und committet sofort, uebernimmt nur Logo/Favicon in den Draft
(ungespeicherte Formular-Eingaben bleiben). Getestet im Wegwerf-Worktree: PNG, SVG, Wechsel PNG↔SVG
(altes Logo wird mit geloescht), SVG mit `onload` abgelehnt, falscher Typ/kaputtes Bild abgelehnt,
`/asset/.env` → 404.
**Nicht gebaut:** kein SVG-Sanitizer (ablehnen statt bereinigen), kein Zuschneiden, keine Favicon-Groessen
ausser 64×64.

## 2026-10-07 — feat(console): Farb-Editor mit Preview und Kontrast-Check — Console Schritt 6
**Was:** Alle 19 `--color-*`-Tokens aus `globals.css` mit Picker + Hex-Feld + Reset; leer = Standard.
Live-Preview (Navbar mit Badge-Glow, Card, Buttons, Chat-Bubbles) in dark und light nebeneinander, darunter
WCAG-Kontrast fuer Button-Text auf Primaer, Primaer als Text auf Hintergrund und empfangene Chat-Bubble
(`bg-primary-fixed-dim text-background`, wie in `chat/[id]/page.tsx`). Speichern ueber den Editor aus
Schritt 5. Getestet im Wegwerf-Worktree per Playwright.
**Nicht gebaut:** kein Color-Picker-Paket, keine Palettenvorschlaege/Auto-Fix bei schlechtem Kontrast.

## 2026-10-07 — feat(console): tenant.json-Editor mit Diff und Auto-Commit — Console Schritt 5
**Was:** Formular fuer Name, Theme, Tier, Module (Tier-Standard/an/aus), Sprachen, Impressum, Seed.
„Pruefen“ validiert mit dem echten Loader und zeigt den Diff, „Speichern & committen“ schreibt und
committet nur `tenants/<slug>/tenant.json` (User will fuer jede Aenderung einen Log). Danach „Mandant neu
starten“, wenn er laeuft. Getestet in einem Wegwerf-Worktree (API + Klickpfad per Playwright), nicht im Repo.
**Nicht gebaut:** kein Raw-JSON-Tab, kein Undo-Button (`git revert`), kein Formular-Framework.

## 2026-10-07 — docs: findings.md — Console Schritt 4
**Was:** `docs/findings.md` sammelt, was beim Bauen auffaellt, aber nicht gefixt wird (Wunsch des Users: „Gut zu wissen“ nicht nur im Chat).
**Nicht gebaut:** —

## 2026-10-07 — feat(console): Stats-Snapshots, Summen und Verlauf pro Mandant — Console Schritt 3
**Was:** „Aktualisieren“ fragt alle Mandanten-DBs ab und speichert einen Snapshot (statt Live-Polling:
weniger Last, und die Snapshots ergeben den Verlauf). Uebersicht: Summen ueber alle Mandanten (nur der
letzte gemeinsame Stand) + User/online/Reports pro Kachel. Detailseite `#/t/<slug>`: alle 16 Werte mit
Delta zum vorigen Stand, Klick auf einen Wert zeigt dessen Verlauf (SVG-Linie mit Hover). Geprueft gegen
die lokale DB: alle 5 Mandanten liefern Stats (Showcase-Mandanten identisch — geteilter Seed).
**Nicht gebaut:** kein SQLite (JSONL reicht), kein Chart-Framework, kein Auto-Refresh, keine
Aufraeum-/Rotationslogik fuer die Snapshot-Datei.

## 2026-10-07 — feat(console): Mandanten-Console mit Uebersicht — Console Schritt 2
**Was:** `npm run console` startet auf http://localhost:3099 eine Uebersicht aller Mandanten (default
zuerst, `_template` ausgeblendet): Name, Tier, Theme, Farb-Tokens als Swatches, Sprachen, Validierungsfehler
aus `parseTenantConfig`, Status (Backend + Frontend-Container laufen) und Frontend-Link.
**Nicht gebaut:** kein Express/Framework, kein Logo-Endpoint (kommt mit dem Logo-Schritt), keine Stats.

## 2026-10-07 — refactor(admin): Dashboard-Stats als reine Funktion — Console Schritt 1
**Was:** Die 16 Queries aus `AdminService.getDashboardStats()` liegen jetzt in
`src/modules/core/admin/dashboard-stats.query.ts` (`collectDashboardStats(query)`), ohne DI. Grund: die
Mandanten-Console fragt jede Mandanten-DB direkt per pg ab und soll dieselben Queries nutzen, statt sie zu
kopieren. SQL unveraendert, nur Alias einheitlich `value`. Jest: dieselben 3 vorbestehenden Fehler
(TicTacToe ×2, demo-seed-path) wie vor der Aenderung.
**Nicht gebaut:** kein Query-Runner-Interface/keine Klasse — ein Funktionstyp reicht.

## 2026-10-06 — feat(showcase): Screenshots + Videos aller Mandanten — Schritt 8
**Was:** `showcase/` (eigenes kleines Playwright-Projekt): pro laufendem Mandant (`tenants/<slug>/.env`
+ default) derselbe Ablauf mit Video — Login, DSGVO-Zustimmung (falls verlangt), Dashboard, Chat-Liste,
Chat, Discover (nur `matching`), Hidden Zone ueber Logo-Easter-Egg + Passwort (nur `hidden`),
Einstellungen. Welche Schritte laufen, kommt aus `GET /tenant`. Danach Vergleichsraster pro Schritt
und mit `ffmpeg` ein 2×2-Vergleichsvideo. Personas in `personas.json`. Ausgabe `showcase/out/`
(gitignored).
Unterwegs gefunden: Zustimmungsseite (`/consent`) beim ersten Login nach dem Seed — als eigener
Schritt aufgenommen; Medien-Rewrite im Frontend (siehe frontend/docs/build-log.md);
`GET /admin/dashboard/user-stats` gibt normalen Nutzern 403 (Controller klassenweit
`@Roles('admin')`), deshalb "—" in "Offene Anfragen/Aktive Chats" — bestehender Fehler, nicht
Teil dieses Umbaus, nicht angefasst.
Verifiziert: echter Lauf gegen alle vier Mandanten (je Backend + `next dev`, lokales Postgres/
Redis/S3-Mock): kiez 6, campus-match 7, miteinander 6, underground 8 Schritte, ohne Fehler; 8
Vergleichsbilder, `vergleich.mp4` (42 s, 2×2). Ergebnisse gesichtet: Marke, Farben, Profilbilder,
Leichte Sprache, Leetspeak + laufender Beef in der Hidden Zone.

## 2026-10-06 — feat(tenant): die vier Showcase-Mandanten + Smoke-Test — Schritt 7
**Was:** `tenants/{kiez,campus-match,miteinander,underground}/tenant.json`: KiezConnect (core, hell,
Orange), Campus Match (premium ohne hidden, dunkel, Pink), Miteinander (connect ohne payments,
`de_easy` als Standardsprache, Blau), Underground (premium inkl. Hidden Zone, dunkel, Cyan). Je
eigene Impressum-Angaben (als Demo markiert) und `seed` auf den eigenen Datensatz. Nur Akzent-
Tokens, weil Tokens fuer hellen und dunklen Modus gelten. Variante 3 laut User-Entscheidung schlank
(ohne Orgs/Caretaker).
`scripts/tenant.sh smoke <slug>|all`: `GET /tenant` (Slug), Owner-Login mit dem Owner aus dem
Datensatz (prueft Seeds + Mandanten-Secrets), je Modul eine Probe-Route ohne Token (FeatureGuard vor
JwtGuard: 404 = aus, 401 = an), Frontend-`<title>` = Markenname. Exit 1 bei Fehlern.
**Nicht gebaut:** Orgs/Caretaker (Variante 3 voll). Pro Mandant eigene Profilfotos.
Verifiziert: 39 Jest-Tests gruen (alle 5 `tenant.json` gueltig). Smoke-Test gegen alle vier laufenden
Mandanten (Backend gegen die in Schritt 6 geseedeten DBs, `next dev`): 28/28 Checks ok — u.a.
miteinander: chat an, matching/payments/hidden 404; underground: alle vier an. Vorher derselbe Test
mit gestopptem Backend: jeder Check als FEHLER gemeldet, Exit 1. Screenshots aller vier als normaler
Nutzer (Dashboard + Chat) zeigen Marke, Theme, Akzentfarbe, Navigation und Sprache je Mandant.

## 2026-10-06 — feat(tenant): Demo-Daten pro Mandant — Schritt 6 des Multitenant-Umbaus
**Was:** `src/database/seeds/demo-seed-path.ts`: `tenant.json` `"seed": "<name>"` ->
`<TENANT_DIR>/<name>/seed/demo-users.yaml` / `demo-relations.yaml`, ohne `seed` die mitgelieferten
Dateien (default-Mandant unveraendert). `demo-seed.ts`, `demo-full-reset.ts` und
`demo-relations-seed.ts` lesen darueber. Fehlt `demo-users.yaml` im Datensatz -> Fehler (sonst
loescht `demo-full-reset` gegen die falsche Liste); fehlt `demo-relations.yaml` -> keine Relations,
nie die default-Datei (andere Nicknames). Relations-Abschnitte duerfen fehlen.
Vier Datensaetze unter `tenants/<slug>/seed/`: kiez (10 User, Nachbarschaft Berlin), campus-match
(10, Studierende Muenster), miteinander (8, Leichte Sprache Koeln), underground (10, Gaming, 3 Beefs
mit Votes/Kommentaren). Fotos/Audio aus den vorhandenen `demoPfp/`/`demoAudio/`.
**Nicht gebaut:** eigene Profilfotos pro Mandant (vorhandene Bilder wiederverwendet). Keine
Swipes/Matches im Seed (Discover-Deck entsteht aus Profilen + Standort). `tenant.json` fuer die vier
Mandanten folgt in Schritt 7.
Verifiziert: `tsc` sauber, 35 Jest-Tests gruen (neu: Pfadauflösung + Test, dass jede in
`demo-relations.yaml` referenzierte Person im Datensatz existiert). Echter Lauf aller vier gegen
lokales Postgres/PostGIS + S3-Mock (init, full-reset, demo-seed, relations, cities, backfill):
kiez 10 User/5 Anfragen/3 Chats/11 Nachrichten, campus_match 10/5/3/11, miteinander 8/3/2/7,
underground 10/4/2/7 + 3 Beefs/8 Votes; je eigener Owner, Medien im eigenen Bucket, Standorte
gesetzt. Zweiter Lauf: nichts angelegt, nichts geloescht. Lint-Befunde der Seed-Skripte unveraendert.

## 2026-10-06 — feat(tenant): eigene Secrets und eigene .env pro Mandant
**Was:** Bisher war `backend/.env` in jeden Mandanten-Container gemountet — alles, was Compose
nicht setzte, kam vom default-Mandanten, u.a. `EMAIL_SALT` und `APP_ENCRYPTION_KEY` (ein Key fuer
alle = wer einen Mandanten-Key hat, entschluesselt alle E-Mails) und `STRIPE_RETURN_URL` (Redirect
nach Zahlung auf das default-Frontend). Jetzt: `tenants/_template/.env.example` als Vorlage,
`scripts/tenant.sh` erzeugt daraus `tenants/<slug>/.env` mit eigenen `JWT_SECRET` (32 Byte),
`EMAIL_SALT` (16 Byte), `APP_ENCRYPTION_KEY` (32 Byte, AES-256) und Platzhaltern fuer eigene
Stripe-/Resend-Keys. `docker-compose.tenant.yml` mountet diese Datei als `/app/.env` (ersetzt dort
`backend/.env`), `JWT_SECRET` nicht mehr aus der Compose-Env. `STRIPE_RETURN_URL` und
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` pro Mandant. Neu `tenant-secrets.ts`: `tenant-init` bricht
ab, wenn ein Secret fehlt oder ungueltig ist (z.B. unausgefuellte Vorlage) — vorher waere das erst
beim ersten Login/Register im Request geplatzt.
**Nicht gebaut:** eigene Postgres-Rolle / MinIO-User pro Mandant (siehe docs/multitenant.md —
Backend verbindet heute als Superuser, RLS-Verhalten wuerde sich aendern). Kein Nachruesten
bestehender `tenants/<slug>/.env` (es gab noch keine).
Verifiziert: `tsc` sauber, 27 Jest-Tests gruen. `tenant.sh` (Docker-Stub) erzeugt die `.env` mit
64/32/64 Hex-Zeichen; `docker compose config` zeigt den Mount auf `/app/.env`, Return-URL auf den
Mandanten-Frontend-Port, kein `JWT_SECRET` mehr in der Compose-Env. `tenant-init` nur mit dieser
Datei (`env -i`, `DOTENV_CONFIG_PATH`): DB + Bucket angelegt; mit unausgefuellter Vorlage -> Exit 1
mit allen drei Secret-Fehlern.

## 2026-10-06 — feat(tenant): Docker-Setup pro Mandant — Schritt 5 des Multitenant-Umbaus
**Was:** `docker-compose.tenant.yml` (Repo-Root): pro Mandant ein eigenes Compose-Projekt
`yb-<slug>` mit `init`, `backend`, `worker`, `frontend` im externen Netz `yb_network` (Haupt-
Compose-Netz hat jetzt diesen festen Namen) auf `XXX_db`/`XXX_redis`/`XXX_minio`. Kein
`DB_NAME`/`S3_BUCKET` im Mandanten-Env; eigenes `JWT_SECRET`, CORS/APP_URL/S3_PUBLIC_URL_BASE auf
die Mandanten-Ports. `TENANT_SLUG` statt `TENANT`, weil die Root-`.env` `TENANT=default` setzt —
ohne Mandanten-env-file scheitert Compose jetzt, statt einen zweiten Stack auf der default-DB zu
starten. `scripts/tenant.sh up|down|ls|logs <slug>|all` legt beim ersten `up` `tenants/<slug>/.env`
an (naechstes freies Portpaar ab 3010/3011, `openssl rand` fuer JWT_SECRET) und startet vorher die
geteilte Infra (`--wait`). `default` bleibt der Haupt-Stack und wird vom Skript abgewiesen.
`src/database/tenant-init.ts` (Service `init`): validiert `tenant.json`, legt DB + Bucket an,
spielt `migrations/NNN_*.sql` ein und merkt sich jede Datei in `tenant_schema_migrations`
(Abbruch -> naechster Lauf setzt fort; neue Migrationen kommen automatisch). Dateien ohne `$$`
laufen Statement fuer Statement — `003` nutzt `CREATE INDEX CONCURRENTLY`, das in einem
Multi-Statement-Query (implizite Transaktion) scheitert. Eine fremde DB mit Schema, aber ohne
Tracking-Tabelle, wird nicht angefasst.
`tenant-infra.helper.ts`: `DB_NAME`/`S3_BUCKET` gelten nur noch fuer den Mandanten `default` —
`backend/.env` (mit `DB_NAME`) ist in jeden Container gemountet, dotenv haette sonst jeden
Mandanten in die default-DB gelenkt.
**Nicht gebaut:** kein Public-Read auf Mandanten-Buckets (Medien laufen ueber den Backend-Proxy).
Kein `reset`-Befehl (DB/Bucket loeschen). `EMAIL_SALT`/`APP_ENCRYPTION_KEY`/Stripe/Resend teilen
sich alle Mandanten (aus `backend/.env`).
Verifiziert: `tsc` sauber, 23 Jest-Tests gruen. `tenant-init` gegen lokales Postgres 16 + PostGIS
und einen S3-Mock (moto; MinIO-Download von der Netzwerk-Policy blockiert): frische DB -> 001–005
eingespielt, Bucket angelegt, gesetztes `DB_NAME` ignoriert; zweiter Lauf -> nichts zu tun;
simulierter Abbruch -> fehlende Dateien nachgezogen, Index wieder da. Dabei gefunden: die
CONCURRENTLY- und Resume-Fehler oben. `docker compose config` loest beide Compose-Dateien korrekt
auf (Namen, Ports, URLs, externes Netz). `tenant.sh` mit Docker-Stub: Portvergabe, idempotente
`.env`, Fehlerfaelle (unbekannt, `default`, `logs all`) brechen mit Exit 1 ab, ohne Infra zu
starten. **Nicht verifiziert:** echtes `docker compose up` — in dieser Umgebung laeuft kein
Docker-Daemon.

## 2026-10-06 — feat(tenant): Isolation pro Mandant — Schritt 3 des Multitenant-Umbaus
**Was:** `src/common/tenant/tenant-infra.helper.ts` leitet aus dem Slug ab: DB `yb_<slug>`
(`-` -> `_`), Bucket `<slug>-media`, Redis-Prefix `<slug>:`, BullMQ-Prefix `<slug>:bull`.
Verdrahtet in `database.config.ts` (API + Worker), `data-source.ts`, allen 10 Seed-/Hilfsskripten,
`object-storage.helper.ts`, `RedisModule` (ioredis `keyPrefix` — deckt Settings-Cache, Throttler,
Beef-State, Last-Active ab) und `QueueModule` (BullMQ `prefix`; ioredis `keyPrefix` ist auf
BullMQ-Connections verboten). `main.ts`/`worker.ts` loggen beim Start Mandant + DB/Bucket/Prefix.
Explizit gesetztes `DB_NAME`/`S3_BUCKET` gewinnt weiterhin — der bestehende default-Stack laeuft mit
seinem Volume unveraendert weiter. Mandanten-Container duerfen beides deshalb nicht setzen (Schritt 5).
**Nicht gebaut:** DB-/Bucket-Anlage pro Mandant (kommt mit dem Docker-Setup, Schritt 5). Redis-Keys
des default-Stacks liegen jetzt unter `default:` — nur Cache/Zaehler/Queues, kein Volume, beim
naechsten Start einfach neu.
Verifiziert: `tsc` sauber, 22 Jest-Tests gruen, Lint-Befunde der beruehrten Dateien identisch zu
vorher. Echter Boot zweier Mandanten gegen dasselbe Postgres/Redis: `pg_stat_activity` zeigt nur
`yb_kiez` fuer kiez; Redis-Keys getrennt unter `kiez:`/`nochat:` (Throttler-Hits + BullMQ-Queues);
ohne `S3_BUCKET` wird der Bucket `kiez-media`.

## 2026-10-06 — feat(tenant): Feature-Gating im Backend — Schritt 2 des Multitenant-Umbaus
**Was:** `app.module.ts` importiert `MatchingModule`, `PaymentModule` und die vier Hidden-Module
(Beef/Coin/Teeth/Badge) nur noch, wenn das Modul in der Tenant-Config an ist — abgeschaltet gibt es
keine Routen, keine Gateways (`/hidden-beef`) und keine Cron-Jobs (`beef.scheduler.ts`).
`ChatModule` bleibt immer geladen: `ChatGateway` liefert auch Notifications/Bans aus, `AdminModule`
nutzt `ConversationsService`. Fuer Chat sperren stattdessen `FeatureGuard` die Routen und
`ChatGateway` die vier Chat-Events (`join_conversation`, `send_message`, `typing`, `read_messages`
— still ignoriert, wie dort bei fehlender Berechtigung ueblich).
Neu: `@RequiresModule(<modul>)` + `FeatureGuard` (global per `APP_GUARD`, laeuft vor `JwtGuard`)
-> 404 statt 401/403, damit ein gesperrtes Modul auch ohne Login nicht als existent erkennbar ist.
Alle Feature-Controller tragen den Decorator als zweite Linie. Neue Config-Regel:
`matching` erfordert `chat` (ein Match legt eine Conversation an).
**Nicht gebaut:** Worker unveraendert — er verarbeitet nur Core-Queues (Media, Auto-Suspend,
Media-Ticket, GDPR). Frontend blendet noch nichts aus (Schritt 4).
Verifiziert: `tsc` sauber, 19 Jest-Tests gruen (neu: FeatureGuard, matching->chat). Echter Boot
des kompletten Backends gegen lokales Postgres 16 + PostGIS (Baseline + Migrationen) und Redis,
drei Mandanten: `default` -> alle Feature-Routen 401; `core` -> discover/hidden 404, chat/payment
401; `core` mit chat+payments aus -> chat/discover/payment/hidden 404, profile weiter 401.

## 2026-10-06 — feat(tenant): Tenant-Config — Schritt 1 des Multitenant-Umbaus
**Was:** `src/common/tenant/` neu. `tenants/<slug>/tenant.json` (Repo-Root) wird beim Boot geladen
(`TENANT`, Default `default`; `TENANT_DIR`, Docker `/tenants`, lokal `../tenants`) und mit
class-validator geprueft (`whitelist` + `forbidNonWhitelisted`, Tippfehler im Key brechen den Boot).
Zusaetzlich: Slug = Ordnername, `locale.default` in `available`, Theme-Tokens nur `--color-*` mit
Hex-Wert (landen spaeter als CSS-Variablen im Browser), Asset-Namen ohne Pfad. Alle Fehler werden
auf einmal gemeldet. Tier (`core`/`connect`/`premium`) setzt Modul-Defaults (`chat`, `matching`,
`payments`, `hidden`), `modules` ueberschreibt einzeln. `TenantModule` ist global und stellt
`TENANT_CONFIG` bereit; `GET /api/v1/tenant` (oeffentlich, SkipThrottle) gibt alles ausser `seed`.
Loader als plain functions (wie `crypto.helper.ts`), damit Seeds/Worker ihn spaeter ohne DI nutzen.
`tenants/default` = bisheriges Verhalten (premium, alle Module an), `tenants/_template` als Vorlage.
`docker-compose.yml`: `TENANT`/`TENANT_DIR` + read-only Mount `./tenants:/tenants` fuer nestjs/worker.
**Nicht gebaut:** noch kein Gating — `modules` wird gelesen, aber noch nichts abgeschaltet (Schritt 2).
`WorkerModule` laedt die Config noch nicht (braucht sie erst mit Schritt 2/3). Connect = Core,
weil Orgs/Caretaker nicht existieren.
Verifiziert: `tsc --noEmit` sauber, 14 Jest-Tests gruen (inkl. Validitaet aller eingecheckten
`tenant.json`). Smoke-Test mit echtem Nest-Boot: `GET /api/v1/tenant` -> 200 mit aufgeloesten
Modulen; kaputte Config und fehlender Mandant -> Boot bricht mit lesbarer Fehlerliste ab.

## 2026-10-05 — chore(deploy): Railway, ngrok, Vercel und Render entfernt — nur noch Docker
**Was:** Einziger Betriebsweg ist jetzt `docker compose` (lokal). Geloescht: `railway.json`,
`Dockerfile.railway`, `docker-entrypoint.railway.sh`, `scripts/deploy/ensure-db.js` (nur vom
Railway-Entrypoint benutzt), `_archive/render.yaml`, `deploy/systemd/` (ngrok-Tunnel + Wake-Timer),
`docs/deployment/railway.md` + `demo-hosting.md`. `ngrok-skip-browser-warning` aus den CORS-
`allowedHeaders` von `main.ts`, `chat.gateway.ts`, `beef.gateway.ts` entfernt. `SEED_ON_BOOT` und
die Vercel-Origins aus `.env.example` raus. Kommentare, die Railway/ngrok als Begruendung nannten,
neutral umformuliert; `architecture.md` nachgezogen.
**Nicht geaendert:** Media-Proxy (`/media/file/*`), `/health`, `COOKIE_SAMESITE` und die
Deck-Groesse 6 bleiben — alle auch ohne Tunnel sinnvoll bzw. Verhaltensaenderung waere eigener Scope.
Aeltere Build-Log-Eintraege bleiben als Historie unveraendert.
Verifiziert: `tsc --noEmit -p tsconfig.build.json` sauber (die 2 Fehler in
`rps.handler.spec.ts` bestehen schon auf dem Stand davor).

## 2026-09-17 — fix(discover): Deck-Groesse 20 -> 6 gegen ngrok-Refusals
**Was:** Live-Messung gegen den echten Tunnel (30 gleichzeitige Requests auf dieselbe
Media-Datei): nur 9/30 kamen durch, 21 scheiterten (`000`, verbindungslos). `loading="lazy"`
(voriger Fix) reicht nicht, weil `discover/page.tsx` ein Grid ist, das alle Kandidaten
gleichzeitig rendert (`grid-cols-2 sm:grid-cols-3`), nicht ein Ein-Karte-nach-der-anderen-Stapel
— auf normalen Bildschirmen sind da 6-15 Karten sofort im sichtbaren Bereich. `buildDeck()` /
`buildDeckWithoutLocation()` in `matching.service.ts` hatten beide `LIMIT 20` — auf User-Vorgabe
("nur 6 laden") auf `LIMIT 6` reduziert.
**Nicht gebaut:** kein konfigurierbarer Wert (Env-Var/System-Setting) fuer die Deck-Groesse —
User hat explizit "6" vorgegeben, kein "mach es einstellbar" verlangt.
Verifiziert: `tsc --noEmit` sauber. Live per echtem Login + `GET /discover/deck` bestaetigt:
`deck size: 6`.

## 2026-09-17 — fix(media): ngrok-Free-Concurrency-Limit + fehlendes SkipThrottle
**Was:** Nach dem MinIO-Proxy-Fix meldete der User weiterhin fehlende Fotos — aber "vorher
schon welche gesehen, jetzt nicht mehr". Browser-Konsole zeigte
`net::ERR_HTTP2_SERVER_REFUSED_STREAM` fuer viele Bild-URLs gleichzeitig. Live geprueft: die
eigenen curl-Testrequests fuer `/api/v1/media/file/...` erscheinen im lokalen ngrok-Inspector
(`localhost:4040/api/requests/http`) als `200 OK` — die vom User gemeldeten, abgelehnten
Requests dagegen NIRGENDS in dieser Historie. Das heisst: sie wurden schon an ngroks
Cloud-Edge verweigert, bevor sie ueberhaupt beim lokalen Agent ankamen — ein bekanntes
ngrok-Free-Verhalten bei zu vielen gleichzeitigen Streams auf einem Tunnel. Seiten wie
Discover/Matches/Beef-Listen laden mehrere Profilfotos gleichzeitig, alle durch denselben
einzigen Tunnel (Backend + jedes einzelne Bild teilen sich eine Verbindung) — das reisst das
Limit. Frontend-seitiger Mitigation-Fix (`loading="lazy"` auf allen Profilfoto-`<img>`s) steht
im `frontend/docs/build-log.md`-Eintrag vom selben Tag.
Hier zusaetzlich gefunden und gefixt: die neue `/api/v1/media/file/*`-Route hatte kein
`@SkipThrottle()` (anders als `/health` und die Railway-Root-Route) — jedes geladene Bild
verbrauchte zusaetzlich vom globalen 100-Requests/60s-Limit pro IP, komplett unabhaengig vom
ngrok-Limit und rein selbstverschuldet.
**Nicht gebaut:** kein Cache-Control-Header auf der Proxy-Route (haette Wiederholungsbesuche
entlastet, aber nicht den ersten Seitenaufruf), kein ngrok-Plan-Upgrade (ausserhalb meiner
Kontrolle) — das ngrok-Limit selbst bleibt eine echte Plan-Grenze, `loading="lazy"` mildert nur.
Verifiziert: `tsc --noEmit` sauber. `curl`-Check bestaetigt: keine `x-ratelimit-*`-Header mehr
auf der Media-Route nach dem SkipThrottle-Fix.

## 2026-09-17 — fix(media): MinIO war weder getunnelt noch HTTPS — Medien app-weit kaputt
**Was:** Folge-Fund aus dem Admin-MediaTab-Fix: das war nur ein Symptom, nicht die Ursache.
`media_uploads.file_url` zeigt (aus `S3_PUBLIC_URL_BASE`) direkt auf MinIO
(`http://localhost:9000/...`). Live geprueft: `curl http://localhost:4040/api/tunnels` zeigt
GENAU EINEN ngrok-Tunnel, auf Port 3000 (Backend) — Port 9000 (MinIO) ist nie getunnelt, also
von jedem echten Besucher der Vercel-Seite aus unerreichbar. Zusaetzlich reines HTTP: selbst
waere MinIO erreichbar, blockt der Browser das Laden von `http://`-Bildern auf einer
HTTPS-Seite (Mixed Content) — betraf nicht nur Admin, sondern JEDES Profilfoto/Audio in der
ganzen App.
Fix: neue oeffentliche (kein Guard) Proxy-Route `GET /api/v1/media/file/*` in
`media.controller.ts`, nutzt das schon vorhandene `downloadObject()` aus
`object-storage.helper.ts` und liefert die Bytes ueber den bereits getunnelten,
HTTPS-Backend-Origin aus. Content-Type per neuer `guessContentType()`-Funktion (Endungs-Map,
identisch zu `demo-seed.ts`s `MIME_BY_EXT` — kein neues `mime`-Package). `S3_PUBLIC_URL_BASE`
zeigt jetzt auf diese Route statt direkt auf MinIO — in `docker-compose.yml` ueber
`${BACKEND_URL:-http://localhost:3000}/api/v1/media/file` (repariert `BACKEND_URL` gleich mit:
war in `.env.example` schon dokumentiert als "used in media file_url storage", aber nirgends im
Code referenziert — toter Env-Var-Kommentar seit der MinIO-Migration). `BACKEND_URL` in der
Root-`.env` (Docker-Compose-Substitution, getrennt von `backend/.env`) auf die ngrok-Domain
gesetzt.
Zweites, eigenstaendiges Problem gefunden und mitgefixt: `demo-seed.ts` ist idempotent und
schreibt `file_url` nur beim erstmaligen Anlegen — die 45 kuratierten Demo-User haetten ihre
alte, MinIO-direkte URL fuer immer behalten, unabhaengig von Neustarts. `demo-full-reset.ts`
(laeuft eh bei jedem Start) reicht darum jetzt zusaetzlich `repairStaleMediaUrls()`: sucht alle
`media_uploads`-Zeilen, deren `file_url` nicht mit der aktuellen `S3_PUBLIC_URL_BASE` beginnt,
extrahiert den Storage-Key (`profiles/...`/`audio/...`) per Regex aus der alten URL und schreibt
die Zeile auf die neue Basis um. Selbstheilend fuer jede zukuenftige Domain-/Schema-Aenderung,
nicht nur diesen einen Fix.
**Nicht gebaut:** kein zweiter ngrok-Tunnel (User-Entscheidung: Proxy-Route statt Multi-Tunnel,
letzteres braucht ngrok Paid fuer mehrere gleichzeitige Endpoints). Die 199 `seed_filler`-Zeilen
aus `seed-media.ts` (Fake-URLs `https://seed.local/...`, siehe deren eigener Kommentar "kein
echtes File auf Disk") bleiben bewusst unrepariert — 64/199 reparierte Zeilen waren die echten
kuratierten Uploads, der Rest hat kein reales Gegenstueck in MinIO, Reparieren wuerde nichts
sichtbar machen.
Verifiziert: `tsc --noEmit` sauber. `eslint` auf den 3 geaenderten Dateien zeigt viele
`prettier`-Treffer — per Vergleich gegen eine komplett unberuehrte Nachbardatei
(`seed-media.ts`, 80 identische Treffer) bestaetigt: repo-weite, vorbestehende Indentation-
Abweichung im ganzen `seeds/`-Ordner (4 statt 2 Leerzeichen), keine Regression durch diese
Aenderung — nicht mitgefixt, haette sonst einen unrelated riesigen Reformat-Diff erzeugt.
Live end-to-end verifiziert: `docker compose up -d nestjs worker` (Env-Aenderung, `docker
restart` allein haette die neue `S3_PUBLIC_URL_BASE` nicht uebernommen), danach `curl` auf die
echte ngrok-URL fuer `admin1`s echtes Foto -> 200, `image/png`, gueltige PNG-Bytes.

## 2026-09-17 — feat(demo): echter Full-Reset auf kuratierten Zustand bei jedem Neustart
**Was:** Geprueft, was `SEED_RESET=true` tatsaechlich macht (in seed-extra-users/-media/
-coin-transactions/-subscriptions-payments): loescht NUR die eigenen `seed_user_%`/
`seed_filler`/`seed:%`-Zeilen dieser Skripte — nie echte `/register`-Accounts, deren
Media/Nachrichten/Consent-Logs. Die Postgres-Daten liegen zusaetzlich in einem persistenten
Docker-Volume (`XXX_pgdata`), das ein normaler Neustart gar nicht antastet. Fuer eine
oeffentliche Demo mit offener Registrierung ("Full-Reset bei jedem Neustart" als Aussage im
Banner/Datenschutz) reicht das nicht — User-Entscheidung: echten Full-Wipe bauen statt nur den
Text zu relativieren.
Neu: `demo-full-reset.ts`, laeuft immer (nicht SEED_RESET-gesteuert) als allererster Schritt in
`docker-entrypoint.sh`. Loescht jeden User, dessen Profil-Nickname nicht in `demo-users.yaml`
steht (45 kuratierte User bleiben, identifiziert ueber Nickname — die YAML-eigenen `id`-Felder
wie "admin1" sind keine DB-UUIDs, nur interne Referenz-Slugs). FK-`ON DELETE CASCADE` raeumt
Profile/Media/Nachrichten/Matches/Beefs/Coins etc. automatisch mit; 5 `RESTRICT`-Tabellen
(`consent_logs`, `payment_logs`, `subscriptions`, `organizations.owner_user_id`,
`strikes.issued_by`) werden vorher explizit geleert. Object-Storage-Dateien der geloeschten
User werden zusaetzlich per neuer `deleteObject()`/`keyFromPublicUrl()`-Funktion in
`object-storage.helper.ts` entfernt (kein neues Package — nur `DeleteObjectCommand` aus dem
schon vorhandenen `@aws-sdk/client-s3`). `docker-compose.yml`: `SEED_RESET`-Default auf `true`
(betrifft nur noch die vier bestehenden Skripte, die dadurch nach dem Full-Reset ohnehin nichts
mehr zum Loeschen vorfinden — redundant, aber harmlos und macht die Env-Var-Doku konsistent).
**Nicht gebaut:** kein zusaetzliches Gate/Env-Var fuer den neuen Full-Reset (laeuft immer,
User-Entscheidung: "bei Backend-Neustart würde ich sowieso einen Docker-Build laufen lassen,
damit die Demo im gewollten Zustand ist" — betrifft also auch lokale Dev-Neustarts auf
derselben Maschine, bewusst in Kauf genommen).
Verifiziert: `tsc --noEmit` sauber. Dry-Run-Query gegen die echte laufende DB bestaetigt exakt
45 kuratierte + 50 `seed_user_*` (95 total, keine User ohne Profil). Echter Container-Restart
durchgefuehrt: Log zeigt "50 nicht-kuratierte User geloescht ... 0/150 Objekte im Object Storage
geloescht" (0 ist korrekt — `seed-media.ts`s Fake-Uploads haben laut eigenem Kommentar
"kein echtes File auf Disk", `keyFromPublicUrl()` erkennt das korrekt und uebersprang sie ohne
Fehler). Backend danach gesund neu gestartet (`/health` -> 200, `NestApplication successfully
started`).

## 2026-09-15 — docs(deployment): Runbook fuer Vercel+ngrok-Demo-Hosting
**Was:** `docs/deployment/demo-hosting.md` neu — Gegenstueck zu `railway.md` fuer den lokalen
ngrok-Pfad (Option A). Deckt ab: Env-Var-Tabelle (`CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_WS_URL`, `BACKEND_INTERNAL_URL`, Kontaktformular-Vars), ngrok-Setup inkl.
`config add-authtoken` als Nutzer `saosgone` (nicht root — der `.service` laeuft mit
`User=saosgone`), systemd-Install/Enable-Befehle fuer alle 3 Units aus dem vorigen Step, Vercel-
Projekt-Setup (Root Directory `frontend`, Standard-Build/Install, kein `vercel.json`),
Web3Forms/Formspree-Option, und eine Checkliste aller MANUELL-Schritte. Enthaelt auch den Hinweis,
dass `BACKEND_INTERNAL_URL` auf Vercel die ngrok-URL braucht (sonst zeigt der `/uploads`-Rewrite
in `next.config.ts` von Vercels Servern aus ins Leere) und den Suspend-nicht-Poweroff-Merker.
**Nicht gebaut:** kein eigener `vercel.json` (Root-Directory-Dashboard-Einstellung reicht,
siehe Step 5 im urspruenglichen Plan — kein eigener Commit dafuer, floss direkt in dieses Doc).

## 2026-09-15 — chore(deploy): systemd-Units fuer Fedora-Autostart + Wake-Timer
**Was:** `backend/deploy/systemd/` neu: `yourbrand-ngrok.service` (tunnelt Port 3000 auf die
reservierte ngrok Static Domain, `After=docker.service`, laeuft als `saosgone`),
`wake-stack.sh` (`docker compose up -d` im Repo-Root + `systemctl restart yourbrand-ngrok.service`),
`yourbrand-wake.service` (Oneshot, ruft `wake-stack.sh`, laeuft als root), `yourbrand-wake.timer`
(`OnCalendar=*-*-* 06:00:00`, `WakeSystem=true` — weckt aus `systemctl suspend`, kein Poweroff/
Hibernate). Docker selbst brauchte keine Compose-Aenderung: alle Services in `docker-compose.yml`
haben bereits `restart: unless-stopped` — nur `systemctl enable docker` fehlt noch (Runbook).
Keine der Dateien wurde live installiert/enabled — das sind bewusst MANUELL-Schritte im Runbook
(`docs/deployment/demo-hosting.md`), inkl. `ngrok config add-authtoken`.
**Nicht gebaut:** kein automatisches Ausschalten/Hibernate (explizit nicht gewuenscht), keine
Weekday-Einschraenkung im `OnCalendar` (Vorgabe war explizit taeglich `06:00:00` — der Timer feuert
ohnehin nur, wenn die Maschine tatsaechlich im Suspend war).
Verifiziert: `systemd-analyze verify` auf allen 3 Units — einzige Meldung ist der erwartungsgemaess
fehlende `/usr/bin/ngrok` (noch nicht installiert, MANUELL-Schritt).

## 2026-09-15 — feat(cors): Multi-Origin-CORS + ngrok-skip-browser-warning
**Was:** `CORS_ORIGIN` wird jetzt komma-separiert gelesen — neuer Helper
`common/config/cors-origins.helper.ts` (`getCorsOrigins(fallback)`, splittet/trimmt/filtert),
verwendet von `main.ts` (REST), `chat.gateway.ts` und `beef.gateway.ts` (beide WebSocket-CORS) —
alle drei lasen bisher `process.env.CORS_ORIGIN` direkt als Einzelstring. Grund: der
Fedora+ngrok-Demo-Pfad braucht CORS gleichzeitig fuer `localhost:3001` (lokal), das
Vercel-Frontend und die Portfolio-Seite. Alle drei CORS-Configs bekamen zusaetzlich
`allowedHeaders` explizit mit `ngrok-skip-browser-warning` (plus `Content-Type`/`Authorization`,
per grep die einzigen vom Frontend gesetzten Header) — ngrok Free zeigt sonst eine
HTML-Warnseite vor jedem GET/WS-Handshake ohne diesen Header.
**Nicht gebaut:** keine Wildcard-Origin-Option, kein Origin-Callback/Function — eine feste,
komma-separierte Liste reicht fuer die bekannten drei Domains.

## 2026-09-15 — feat(health): unprefixed /health-Endpoint fuer ngrok-Smoketest
**Was:** Neue `@Get('health')`-Methode auf `AppController`, literal `{ status: 'ok' }` (nicht
`AppService.getStatus()` — der bleibt unveraendert fuer den bestehenden Railway-Healthcheck unter
`/api/v1` inkl. dessen `uptime`-Feld). `main.ts`s `setGlobalPrefix('api/v1', { exclude: [...] })`
nimmt `health` (GET) vom Prefix aus, damit der Pfad direkt unter der ngrok-Tunnel-Root liegt statt
unter `/api/v1/health`. Grund: der Fedora+ngrok-Demo-Hosting-Pfad (Option A, siehe kommender
`docs/deployment/demo-hosting.md`) braucht einen simplen, prefix-freien Alive-Check zum Curl-Test,
unabhaengig vom Railway-Vertrag.
**Nicht gebaut:** kein `@nestjs/terminus`, kein DB-Check — reiner Prozess-Alive-Check.
Laufzeit-Verifikation per `curl` nicht gemacht: der lokale Docker-Stack laeuft aktuell nur als
Loadtest-Variante (`docker-compose.loadtest.yml`, andere Container-Namen/Ports); den
Haupt-Stack (`docker-compose.yml`) parallel dazu hochzufahren haette Portkonflikte riskiert.
`tsc --noEmit` lief sauber fuer die geaenderten Dateien (die einzigen zwei verbleibenden Fehler
sind vorbestehend und liegen in `rps.handler.spec.ts`, unberuehrt von diesem Step).

## 2026-09-12 — docs: Worker-Prozessrolle in CLAUDE.md + architecture.md nachgetragen
**Was:** `src/worker.ts`/`src/worker.module.ts` (zweite Prozessrolle, `docker-compose.yml`s
`worker`-Service, hostet alle BullMQ-`@Processor`) tauchte in `backend/CLAUDE.md`s
Architektur-Baum gar nicht auf. `docs/architecture.md`s "Was neu / umgebaut werden muss"-Tabelle
war zusätzlich inkonsistent: die Zeile "Queue / Object Storage" stand noch auf "Existiert nicht",
obwohl alle zugehörigen Processor-Zeilen (Media-Pipeline, GDPR-Export, `checkAutoSuspend`,
`createImageTicket`) schon einzeln als "Erledigt 2026-09-10" markiert waren — die
zusammenfassende Zeile wurde beim jeweiligen Abhaken nicht mitgezogen. Beide Stellen jetzt
korrigiert; `## Module`-Abschnitt in architecture.md bekam ebenfalls einen Eintrag für den Worker.
**Nicht gebaut:** keine rückwirkende Datumsrecherche, wann genau der Worker fertig wurde — als
"Datum nicht mehr rekonstruierbar" vermerkt statt geraten.

## 2026-09-12 — chore(notifications): Verweis-Kommentar auf DB-Enum ergänzt
**Was:** `NotificationType` (TS-Union, 9 Werte) ist aktuell deckungsgleich mit dem DB-Enum
`public.notification_type`, aber `notifications.type` ist im Entity `@Column() type!: string`
ohne `enum:`-Option — nur die DB-Spalte erzwingt die Werteliste, TypeORM/TypeScript tun es nicht.
Kommentar ergänzt, der das explizit macht, damit ein neuer Typ nicht nur im TS-Union ergänzt wird
(würde zur Laufzeit an der DB scheitern, TypeScript bliebe aber grün).
**Nicht gebaut:** kein `enum:`-Constraint auf der Spalte selbst — das wäre eine Verhaltensänderung
(TypeORM würde dann bei Schreibversuchen mit unbekanntem Wert selbst validieren/werfen), nicht nur
eine Doku-Ergänzung, und stand nicht zur Debatte.

## 2026-09-12 — fix(db): doppelten CHECK-Constraint auf beefs.status entfernt
**Was:** `beefs` hatte zwei CHECK-Constraints mit identischer Werteliste (nur andere Reihenfolge
im ARRAY-Literal): den auto-generierten `beefs_status_check` und den benannten `chk_beef_status`
(folgt der Projekt-Namenskonvention `chk_*`, wie `chk_beef_no_self` in derselben Tabelle). Neue
Migration `005_drop_duplicate_beef_status_check.sql` droppt `beefs_status_check`, `chk_beef_status`
bleibt. In `db/Dockerfile` gebacken wie 002-004; per Docker-Build + Container-Start verifiziert
(`pg_constraint` zeigt nur noch `chk_beef_status` auf `beefs`).
**Nicht gebaut:** keine Änderung an den erlaubten Status-Werten selbst — nur der doppelte
Constraint entfernt.

## 2026-09-12 — chore(db): Usage-Kommentar für delete-user.ts/run-sql.ts ergänzt
**Was:** Beide Skripte hatten keinen Aufrufer im Repo und wurden im Audit als
möglicherweise-verwaist markiert (Confidence "mittel", da plausible manuelle Ops-Tools). Statt
löschen: Kopfkommentar ergänzt, der explizit sagt, dass sie absichtlich nur manuell per CLI
aufgerufen werden, plus den Aufruf-Befehl — damit ein künftiger Verwaist-Scan sie nicht wieder
fälschlich als tot einstuft.
**Nicht gebaut:** keine Löschung, kein Wrapper-Script/package.json-Eintrag dafür — bleiben
bewusst Ad-hoc-Tools.

## 2026-09-12 — delete: verwaistes Debug-Skript check-columns.ts entfernt
**Was:** `src/database/seeds/check-columns.ts` war eine hardcodierte `information_schema`-Query
gegen die `conversations`-Tabelle — kein Aufrufer in package.json, keinem Entrypoint-Skript, keine
Referenz sonst im Repo (`grep -rn "check-columns"` → 0 Treffer außerhalb der Datei selbst).
**Nicht gebaut:** kein Ersatz — war ein Einweg-Debug-Skript, kein wiederverwendbares Tool.

## 2026-09-12 — chore(db): post-baseline-Migrationen 002-004 in db/Dockerfile gebacken
**Was:** `db/Dockerfile` buk bisher nur `migrations/001_baseline.sql` in
`/docker-entrypoint-initdb.d/`; ein frischer `docker compose up` (oder `docker-compose.loadtest.yml`)
brauchte danach manuell `002_seed_system_user.sql`, `003_track_b_missing_indexes.sql` und das neue
`004_drop_redundant_ban_expiry_trigger.sql`. Alle drei jetzt zusätzlich als `COPY` reingenommen
(Dateinamen sortieren nach `000_schema.sql` schon richtig: 000 → 002 → 003 → 004 — Postgres führt
`/docker-entrypoint-initdb.d/` in Dateiname-Reihenfolge aus). Lokal per `docker build` +
Container-Start verifiziert: alle drei Skripte laufen ohne Fehler durch (INSERT, 5×CREATE INDEX,
DROP TRIGGER/FUNCTION). Werden am Ende des laufenden Reworks ohnehin wieder in eine neue Baseline
zusammengefasst — bis dahin hält das den Docker-Build synchron mit `migrations/`.
**Nicht gebaut:** `scripts/deploy/ensure-db.js` (Railway-Boot-Pfad) nicht angepasst — der Auftrag
war explizit der Docker-Build (`db/Dockerfile`), nicht der Railway-Boot-Guard. Der spielt weiterhin
nur die Baseline ein; falls Railway dieselbe Automatisierung braucht, ist das ein eigener Punkt.

## 2026-09-12 — refactor(auth): zentrales UserRole-Enum statt drei unabhängiger Definitionen
**Was:** `user_role` existierte dreifach: als Postgres-ENUM (`migrations/001_baseline.sql`), als
Inline-Array `['user','admin','org','owner']` auf `User.role` und als eigenes, unvollständiges
`UserRole`-Enum (ohne `owner`) in `admin/dto/update-user-role.dto.ts`, das außerhalb der eigenen
Datei nirgends importiert wurde — totes Duplikat. Neues `UserRole`-Enum jetzt einzig in
`auth/entities/user.entity.ts` (`User.role` ist jetzt `UserRole` statt `string`); die DTO-Datei
importiert nichts mehr eigenes, `AssignableRole` bleibt als bewusste, kommentierte Teilmenge
bestehen (TS-String-Enums können keine Member von einem anderen Enum ableiten). Drei
`userRepo.create({ role: 'admin' | 'owner' })`-Stellen (admin.service.ts, setup.service.ts) auf
`UserRole.ADMIN`/`UserRole.OWNER` umgestellt; `admin.service.ts:setUserRole` castet die
validierte `AssignableRole` explizit auf `UserRole` (mit Kommentar, warum das sicher ist).
**Nicht gebaut:** keine Anpassung der JWT-Payload- oder Guard-Typen (`roles.guard.ts`,
`owner.guard.ts`, `chat.gateway.ts` etc.) — die lesen `role` aus dem decodeten JWT-Payload
(einem eigenen, losen Typ), nicht aus der `User`-Entity, und waren von diesem Fund nicht betroffen.

## 2026-09-12 — delete: tote TypeORM-Migration CreateCitiesTable.ts entfernt
**Was:** `src/database/migrations/1748908800000-CreateCitiesTable.ts` legte `cities` an — die
Tabelle steckt aber schon in `migrations/001_baseline.sql:1025-1034` mit identischen Spalten.
`db/Dockerfile` und `scripts/deploy/ensure-db.js` spielen ausschließlich die Baseline ein, die
TypeORM-Migration war auf jeder realen Umgebung ein permanentes No-op und irreführend für
`npm run migration:run`. `grep -rn "CreateCitiesTable\|1748908800000"` findet danach keine
Referenz mehr außerhalb der gelöschten Datei selbst.
**Nicht gebaut:** kein Ersatz, keine neue Migration — `src/database/migrations/` ist jetzt leer,
das ist beabsichtigt (siehe CLAUDE.md: dieser Mechanismus ist nur für die Cities-Tabelle gedacht
und die steckt in der Baseline).

## 2026-09-12 — refactor(chat): gemeinsamer ConversationsService.getOrCreate() für swipe/chat/admin
**Was:** `swipe.service.ts` (Match), `chat.service.ts` (Kontaktanfrage-Annahme) und
`admin.service.ts` (Direct-Chat) legten je eine eigene, leicht abweichende "existiert schon
eine Conversation zwischen diesen beiden?"-Prüfung an — `conversations` hat keinen UNIQUE-
Constraint auf `(user_a_id, user_b_id)`, der Duplikate verhindern würde. `swipe.service.ts`
prüfte dabei nur auf eine existierende `Match`-Row, nie auf eine existierende Conversation —
ein Match nach vorheriger Kontaktanfrage/Admin-Chat hätte eine zweite, doppelte Conversation
erzeugt. Neuer `ConversationsService.getOrCreate(userIdA, userIdB, { contactRequestId? })` im
Chat-Modul (exportiert), MatchingModule und AdminModule importieren jetzt `ChatModule` statt
eigener `Conversation`-Repository-Injection bzw. Raw-SQL. Verhalten folgt dem bisherigen
`chat.service.ts`-Pfad: eine gefundene Conversation (auch vollständig gelöschte/`purged_at`)
wird reaktiviert statt dupliziert.
**Nicht gebaut:** kein UNIQUE-Constraint/Migration für `(user_a_id, user_b_id)` — das wäre der
nächste Schritt, aber eine eigene DB-Entscheidung außerhalb dieses Fixes.

## 2026-09-12 — fix(moderation): DB-Trigger für Ban-Aufhebung entfernt, App-Code ist einzige Wahrheit
**Was:** `trg_strikes_check_ban_expiry`/`trigger_check_ban_expiry()` dupliziert dieselbe
Ban-Aufhebungsregel wie `auth.service.ts` (Login-Pfad) und war zusätzlich fehlerhaft:
`admin.service.ts:unbanUser()` setzt `strikes.ban_lifted_at` per UPDATE, was denselben
BEFORE-UPDATE-Trigger feuert und bei bereits abgelaufenem `expires_at` `lifted_by_job = true`
setzt — ein manueller Admin-Unban wurde damit fälschlich als job-gelifted markiert. Neue
Migration `migrations/004_drop_redundant_ban_expiry_trigger.sql` droppt Trigger + Funktion;
Kommentar in `auth.service.ts` dokumentiert den Login-Pfad jetzt als alleinige Quelle.
**Nicht gebaut:** kein Ersatz-Cron-Job für Bans ohne nächsten Login — gab es vorher auch nicht
(der Trigger feuerte nur bei einem UPDATE auf strikes, nie autonom). Spalten
`strikes.ban_lifted_at`/`lifted_by_job` unverändert im Schema gelassen.

## 2026-09-12 — feat(profile): harter Moderation-Gate-Check für alle Foto-Auslieferungspfade
**Was:** `docs/audit.html` (Read-only-Audit vom selben Tag) fand, dass Profilfotos in
`getPublicProfile`, `searchProfiles`, `getProfileByUserId` und `getBlocks` immer ausgeliefert
wurden — nur `needs_review` (Boolean) wurde mitgeschickt, ohne die Auslieferung zu blockieren.
`matching.service.ts` prüfte für den Matching-Feed dagegen schon immer hart auf
`moderation_status='approved'`, Audio ebenso (`profile.service.ts:339`). Alle vier Foto-Pfade in
`profile.service.ts` lesen jetzt zusätzlich `moderation_status` und liefern die URL nur bei
`APPROVED` aus — `needs_review` bleibt als reines UI-Flag erhalten. `getOwnProfileWithPhoto`
bleibt bewusst ungegatet, da der Owner sein eigenes (noch ungeprüftes) Foto sehen soll.
**Nicht gebaut:** kein neues DTO-Feld, kein Eingriff in den Upload-Flow oder die
Moderation-Queue selbst — nur die Lesepfade wurden vereinheitlicht.

## 2026-09-11 — chore: drop stale HANDOFF.md, gitignore .idea/
**Was:** `HANDOFF.md` (root, untracked) beschrieb den `belastung`-Branch-Stand vom 2026-07-31 —
der Branch ist längst in `main` gemerged, der Loadtest-Dashboard-Stand ist seit `93c5c56`
(2026-08-06) weiter. Gelöscht statt archiviert, da nie committet und ohne Referenz von
irgendwo. `.idea/` (untracked JetBrains-Ordner) zum `.gitignore` hinzugefügt, damit er nicht
versehentlich mitcommittet wird.
**Nicht gebaut:** —

## 2026-09-11 — fix(docs): root README pointed at archived schema_v4.sql
**Was:** Root `README.md`'s "Running Locally"-Abschnitt sagte noch, man solle `backend/schema_v4.sql`
laden — die Datei wurde am 2026-09-10 (Schema-Baseline-Konsolidierung) nach
`migrations/_archive/schema_v4.sql` verschoben und existiert am alten Pfad nicht mehr. Auf dieselbe
Formulierung wie `backend/README.md:649` umgestellt (`migrations/001_baseline.sql` + Migrationen
danach in Reihenfolge ausführen).
**Nicht gebaut:** —

## 2026-09-11 — chore(docs): archive orphaned root-level docs/ folder
**Was:** Root `docs/` (`build-log.md`, `known-errors.md`, `loadtest-ist-zustand.md`) war seit dem
Split in Per-Package-Docs (`backend/docs/`, `frontend/docs/`) verwaist — letzter Touch
2026-07-24/08-05, keine `.md`-Datei im Repo verlinkt mehr dorthin. Nach `docs/_archive/`
verschoben (Muster analog zu `migrations/_archive/`), jede Datei mit Archiv-Header versehen statt
kommentarlos verschoben.
**Nicht gebaut:** keine Inhalts-Migration einzelner Root-Log-Einträge hierher — die Root-Historie
ist reines Altmaterial aus der Vor-Split-Phase, nicht mehr aktueller Kontext für dieses Log.

## 2026-09-10 — fix(db): missing indexes on beef_votes/beef_comments/coin_transactions/teeth/badges (Track B)
**Was:** Fünf Fremdschlüssel-artige Lookup-Spalten hatten keinen Index, jeder Read auf diesen
Tabellen war ein Seq Scan: `beef_votes(beef_id)`, `beef_comments(beef_id)`,
`coin_transactions(user_id)`, `teeth(owner_id)`, `badges(expires_at)`. Neue Migration
`migrations/003_track_b_missing_indexes.sql`, jeweils `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
(User-Entscheidung statt normalem `CREATE INDEX`, non-blocking falls die Tabelle bereits live
ist) — läuft deshalb außerhalb einer Transaktion, wie im Datei-Kommentar vermerkt.
**Verifiziert:** gegen die lokale Dev-DB (`XXX_db`-Container, per `docker compose up -d XXX_db`
gestartet) gefahren, alle fünf Indizes über `pg_indexes`/`pg_index.indisvalid` als vorhanden und
gültig bestätigt.
**Nicht gebaut:** keine weiteren Indizes über die fünf im Backlog genannten hinaus — kein
allgemeiner Index-Audit.

## 2026-09-10 — fix(moderation): Access-Scope-Bug in getReports/getReport/getStrikes (Track B)
**Was:** Die drei `@Roles('admin')`-Routen `GET /moderation/reports`, `GET /moderation/reports/:id`,
`GET /moderation/strikes` filterten auf `req.user.sub` (die ADMIN-ID) — `getReports(reporterId)`
zeigte also nur Reports, die der Admin selbst als normaler User eingereicht hatte (praktisch nie),
`getStrikes(userId)` nur Strikes gegen den Admin selbst. Vermutlich Reste einer aelteren
Self-Service-Variante ("meine eigenen Reports"), die spaeter unveraendert hinter die Admin-Routen
gehaengt wurde. Filter komplett entfernt, alle drei Methoden geben jetzt plattformweite Daten
zurueck (bzw. per ID, unabhaengig vom Ersteller).
**Recherche vor dem Fix:** geprueft, ob diese Routen ueberhaupt vom Frontend genutzt werden —
nirgends gefunden. Das Frontend nutzt stattdessen `/admin/reports`/`/admin/strikes`
(`admin.controller.ts`), die bereits korrekt plattformweit filtern (mit Pagination). Dem User
beide Optionen vorgelegt (loeschen vs. fixen) — Entscheidung: fixen, Routen bleiben fuer
moegliche kuenftige Verwendung.
**Verifiziert End-to-End:** Reporter meldet Target, Admin (0 eigene Reports) sieht den Report in
der Liste UND per Einzel-Abruf per ID; Admin erstellt einen Strike gegen Target, sieht ihn danach
in der eigenen `GET /moderation/strikes`-Antwort zusammen mit einem alten Auto-Suspend-Strike aus
einem frueheren Test — beides fremde Datensaetze, korrekt sichtbar. Testdaten (3 User, 1 Report,
1 Strike) direkt danach wieder entfernt.
**Nicht gebaut:** keine Pagination fuer diese drei Routen (die haben `/admin/reports`/`/admin/strikes`
bereits) — nur der Scope-Bug, kein Feature-Ausbau.

## 2026-09-10 — fix(teeth): Race-Condition in transform() behoben (Track B — Correctness)
**Was:** `TeethService.transform()` las 15 unkonvertierte Zähne, prüfte die Anzahl, schrieb dann
`converted_to_chain=true` — alles ohne Lock oder Transaktion. Zwei parallele Aufrufe fuer denselben
User konnten dieselben 15 Zähne lesen, beide die Pruefung bestehen und beide eine Chain anlegen
(Zaehne doppelt verwertet). Jetzt `dataSource.transaction()` mit
`SELECT ... FOR UPDATE` (gleiches Muster wie `coin.service.ts`s `spendCoins`) — eine parallele
Transaktion blockiert auf dem Lock statt dieselben Zeilen zu lesen.
**Verifiziert mit echter Postgres-Lock-Konkurrenz** (nicht nur Code-Review): zwei parallele
`psql`-Transaktionen mit `pg_sleep` gegen 15 vorbereitete Test-Zaehne, dieselbe SQL-Sequenz wie
der Fix. Ergebnis: Transaktion A gewinnt den Lock und committet, Transaktion B blockiert, sieht
danach 0 verfuegbare Zaehne und wirft korrekt "Nicht genug Zaehne, hatte 0". Endzustand: exakt
1 Chain, 0 unkonvertierte Zaehne — kein Doppel-Chain. Testdaten liefen versehentlich gegen das
persistente Demo-DB-Volume (nicht isoliert) — danach gezielt wieder entfernt (User/Beef/Teeth/
Chain per ID geloescht), keine Demo-Seed-Daten beruehrt.
**Nicht gebaut:** keine Aenderung an der Chain-Groesse (15) oder sonstiger Business-Logik — nur
der fehlende Lock.

## 2026-09-10 — feat(bcrypt): dedizierter piscina-Worker-Thread-Pool
**Was:** `src/common/bcrypt/` neu — `bcrypt.worker.ts` (laeuft in piscina-Worker-Threads, nutzt
`bcrypt.hashSync`/`compareSync` da bereits im eigenen Thread) + `bcrypt-pool.helper.ts` (plain
functions `hashPassword`/`comparePassword`, kein DI — Singleton-Pool via `getPool()`, gleiche
`.ts`/`.js`-Dualmode-Aufloesung wie TypeORMs Entity-Glob in `app.module.ts`/`worker.module.ts`).
Alle 9 echten API-Call-Sites (`auth.service.ts` ×7, `admin.service.ts`, `setup.service.ts`) auf
die neuen Funktionen umgestellt, direkter `bcrypt`-Import dort entfernt. Seed-Skripte
(`demo-seed.ts`, `seed-extra-users.ts`) bewusst NICHT angefasst — laufen ausserhalb des
API-Prozesses, kein Konkurrenz-Problem dort.
**User-Entscheidung:** `piscina` statt der von mir empfohlenen `UV_THREADPOOL_SIZE`-Env-Var
(Begruendung + Rechnung dazu unter Entscheidungen in `docs/architecture.md`).
**Verifiziert:** Standalone-Test zeigte echte Parallelitaet (8 gleichzeitige Hashes in 226ms statt
seriell ~2000ms). End-to-End gegen echte App: Register/Login/falsches-Passwort alle korrekt,
20 gleichzeitige Logins gegen denselben User in 323ms. Sauberer Vorher/Nachher-Vergleich mit
derselben Methodik wie Phase 3 (`login-capacity.sh` gegen den Loadtest-Stack, 1000 User):
**Ceiling ~20-30 req/s → ~70-90 req/s (grob 3x)**, 100%-Erfolgsrate haelt jetzt bis 70/s statt
vorher bis 20/s.
**Stolperstein:** `docker compose up --build` reicht nicht, wenn ein Service ein `- /app/node_modules`
Anonymous-Volume aus einem frueheren Lauf hat — das Volume ueberlebt den Image-Rebuild und
verdeckt die frisch installierte Dependency (`piscina` fehlte trotz `--build` im Container).
Gefixt mit `docker exec ... npm install piscina` + Container-Neustart; `XXX_backend_load`/
`XXX_worker_load` waren davon nicht betroffen (frisch von Grund auf entfernt seit Phase 3).
**Nicht gebaut:** kein Anfassen der Seed-Skripte (siehe oben), keine Aenderung an der
Kostenfaktor-Konstante (12) selbst — nur die Ausfuehrung isoliert, nicht die Kosten reduziert.

## 2026-09-10 — chore(loadtest): minio-load-Hostname-Bug gefixt + Phase-3-Messung durchgeführt
**Was:** Beim Aufsetzen des Loadtest-Stacks fuer Phase 3 (frischer `XXX_load_pgdata`, war 2 Wochen
alt und pre-Baseline-Migration) einen echten Bug gefunden: `mc` (Go) lehnt den Hostnamen
`XXX_minio_load` (Unterstriche) als "invalid hostname" ab — `ioredis`/`pg`/`aws-sdk` sind da
toleranter, darum ist das nie vorher aufgefallen. Service in `docker-compose.loadtest.yml` zu
`minio-load` (Bindestrich) umbenannt, alle Referenzen mitgezogen. `migrations/002_seed_system_user.sql`
manuell auf die frische Loadtest-DB angewendet (wird nicht automatisch mitgebacken).
**Phase-3-Messung** (`scripts/loadtest/endpoint-rate.sh` Mode 3, `login-capacity.sh` Mode 1, gegen
1000 geseedete User): zwei Methodik-Fehler unterwegs gefunden und korrigiert, bevor die Zahlen
sauber waren — (1) `/admin/media/pending` in der Endpoint-Auswahl loeste faelschlich `AUTO_STOP`
aus (403 wegen fehlender Admin-Rolle bei Testusern, keine Kapazitaetsgrenze), raus aus der Auswahl.
(2) `login-capacity.sh` groesste `users.csv` nach `MAX_RATE × STEP_SEC` unabhaengig von der
tatsaechlich geseedeten User-Zahl (1000) — bei `MAX_RATE=200` wuchs die Datei auf 1600 Zeilen,
Round-Robin traf nicht-existente User 1001-1600, Ergebnis war ein Burst `401` der wie ein
Kapazitaetseinbruch aussah. `users.csv` explizit neu auf 1000 Zeilen erzeugt, danach sauber.
**Ergebnisse** (Details + Hochrechnung in `docs/architecture.md`, Sektion "Phase-3-Messung"):
allgemeiner Traffic ~250-270 req/s/Instanz bei API-CPU-Saettigung (90-125%, >1 Kern), DB dabei nur
bei 44-48% CPU — die DB ist kein Flaschenhals, mehr Instanzen sind der richtige Hebel. Login/bcrypt
bleibt mit ~20-30 req/s/Instanz der mit Abstand engste Engpass, unveraendert seit dem
Media-Pipeline-Umzug — bestaetigt, dass Sharp-Threadpool-Konkurrenz nie die Hauptursache war.
**Nicht gebaut:** keine echte Produktions-Hochrechnung (Annahmen zu Klick-Intervall/Concurrent-
Usern fehlen, mit Platzhaltern explizit markiert), keine bcrypt-Isolierung selbst umgesetzt — nur
gemessen, dass sie jetzt datenbelegt sinnvoll waere.

## 2026-09-10 — docs(architecture): Phase 2 abgeschlossen, vollständiges Backlog nachgetragen
**Was:** Phase 2 als abgeschlossen markiert (5/6 umgesetzt, bcrypt-Isolierung bewusst auf Phase 3
verschoben). Neue Sektion "Offene Punkte (Backlog)" in `docs/architecture.md`: alle Track-B-Punkte
(Correctness + Wartbarkeit) aus der urspruenglichen Plan-Nachricht explizit als Checkliste
nachgetragen — die standen bisher nur in der Chat-Nachricht, nie im Repo, mit echtem Risiko sie
zu verlieren. Dazu die waehrend Phase 0-2 gefundenen, bewusst zurueckgestellten Punkte
(Dockerfile.railway Multi-Stage, beef.scheduler.ts Cron-Dopplung, createNicknameTicket) an einer
Stelle gesammelt, plus Phase 3s drei Schritte.
**Nicht gebaut:** keine zweite Tracking-Datei — eine `docs/`-Datei mehr als die drei etablierten
(build-log/errors/architecture) haette parallel gepflegt werden muessen und waere ueber die Zeit
auseinandergelaufen. Backlog lebt in `architecture.md`, wird dort editiert (nicht angehaengt),
wie der Rest der Datei.

## 2026-09-10 — feat(gdpr): Export async, PDF als Mail-Anhang (Phase 2, Punkt 5/6)
**Was:** `GdprService.generateExport` (15 parallele Queries + ~300 Zeilen `pdfkit`-Layout,
synchron auf dem Event-Loop) komplett unveraendert nach `gdpr-export.processor.ts` verschoben
(`@Processor`, nur `WorkerModule`). `GdprService` bleibt nur noch die Rate-Limit-Pruefung
(30-Tage-Fenster, bleibt synchron — billig, soll schnell ablehnen) + Enqueue. `GET /gdpr/export`
antwortet jetzt sofort mit einer Bestaetigung statt den PDF-Buffer zu streamen — **API-Vertrags-
Bruch** (Response-Shape aendert sich von PDF-Blob zu JSON, Frontend muesste das anpassen, ausserhalb
dieses Backend-Schritts). `MailService.sendGdprExportEmail` neu: PDF als Anhang (Resend
unterstuetzt `attachments`, max. 40 MB — GDPR-Export bleibt weit darunter), User-Entscheidung
gegen Object-Storage-Link (Bucket ist public-read, Export enthaelt echte PII).
`last_gdpr_export_at` wird jetzt erst NACH erfolgreichem Mailversand gesetzt (vorher: nach
PDF-Build) — ein fehlgeschlagener Job (z.B. Resend down) verbrennt das 30-Tage-Fenster nicht,
ein Retry baut die ganze Sache neu. Kein Try/Catch um den Mailversand (anders als bei
checkAutoSuspend/media-ticket): hier IST die Mail der gesamte Zweck des Jobs, ein Fehlschlag soll
den ganzen Job retrybar machen, nicht verschluckt werden.
Nebenbei: `GdprModule`s `TypeOrmModule.forFeature([User])` entfernt — der injizierte `userRepo`
wurde in `generateExport` nie tatsaechlich benutzt (nur `dataSource.query` direkt), toter Code.
**Verifiziert End-to-End** gegen echte Container: `GET /gdpr/export` antwortet sofort, Worker
fuehrt alle 15 Queries aus, baut das PDF, verschickt die Mail erfolgreich (kein Fehler, `UPDATE
last_gdpr_export_at` lief durch), zweiter Export-Versuch direkt danach korrekt mit 403
("erst wieder moeglich ab ...") abgelehnt.
**Nicht gebaut:** keine Deduplizierung bei mehrfachen schnellen Klicks vor Job-Abschluss (waeren
mehrere Jobs/Mails, aber kein Korrektheitsproblem — analog zur checkAutoSuspend-Entscheidung).
Frontend-Anpassung an die neue Response-Form nicht Teil dieses Schritts.

## 2026-09-10 — feat(moderation): createImageTicket über die Queue (Phase 2, Punkt 4/6)
**Was:** `ProfanityService.createImageTicket` (ein INSERT + Event, aufgerufen als
`.catch(() => {})` OHNE Logging — schlimmer als checkAutoSuspend, ein Fehlschlag verschwand
komplett) rausgezogen nach `media-ticket.processor.ts` (`@Processor`, nur `WorkerModule`).
`media.service.ts` enqueued jetzt stattdessen einen Job auf einer neuen `media-ticket`-Queue.
War der einzige Aufrufer von `createImageTicket` — Methode aus `ProfanityService` entfernt,
`ModerationModule`-Import aus `media.module.ts` dadurch ebenfalls ueberfluessig geworden
(`MediaService` brauchte `ProfanityService` sonst nirgends mehr). Nebenbei zwei tote Reste aus
Schritt 2 aufgeraeumt: ungenutzter `Inject`-Import und `User`-Entity-Import in `media.service.ts`.
**Verifiziert End-to-End** gegen echte Container: Foto-Upload erzeugte einen korrekten
`admin_tickets`-Eintrag (`type='image'`, `context` mit `media_id`/`user_id`), unabhaengig vom
parallel laufenden Media-Processing-Job (beide Queues verarbeiten den Upload gleichzeitig, ohne
sich gegenseitig zu beeinflussen).
**Nicht gebaut:** `createNicknameTicket` (dieselbe INSERT+Event-Struktur, andere Aufrufstelle)
nicht angefasst — war nicht Teil des Plans, kein bekanntes Fire-and-forget-Problem dort.

## 2026-09-10 — fix(moderation): checkAutoSuspend als idempotenter Job + System-User-Bug gefixt (Phase 2, Punkt 3/6)
**Was:** `checkAutoSuspend` aus `moderation.service.ts` rausgezogen nach `auto-suspend.processor.ts`
(`@Processor`, nur `WorkerModule`-Provider). `createReport` enqueued jetzt einen Job statt
`void ...checkAutoSuspend().catch(logger.error)`. Ban- und Strike-Schritt sind jetzt EINZELN
idempotent (`if (!user.is_banned)`, `strikeRepository.findOne({report_id, issued_by, type})` statt
dem alten `if (user.is_banned) return` ganz am Anfang — das haette bei einem Retry nach
Teilerfolg NIE Strike/Notification/Mail nachgeholt, weil es sofort zurueckgesprungen waere.
Notification/Mail bleiben bewusst nicht dedupliziert (try/catch wie vorher) — ein doppelter Hinweis
ist kein Korrektheitsproblem, ein fehlender Strike/Bann schon.
**Echter Bug beim End-to-End-Test gefunden:** `strikes.issued_by = SYSTEM_USER_ID
('00000000-...-0000')` verletzte die FK — dieser User existierte nie in `users`, obwohl das Schema
ihn an mehreren Stellen voraussetzt (`pseudonymize_user()`, Views, `vulnerable_flag_audit`-Default).
`checkAutoSuspend` ist damit vermutlich seit jeher gescheitert, nur durch den verschluckten
`.catch()` unsichtbar. Mit User-Bestaetigung `migrations/002_seed_system_user.sql` angelegt
(idempotenter INSERT, Placeholder-`email_search_hash` fuer die NOT-NULL-Constraint).
**Verifiziert End-to-End** gegen echte Container: `auto_suspend_threshold` testweise auf 2
gesenkt, zwei Reports von verschiedenen Usern ausgeloest. Vor dem Migrations-Fix: Ban griff
korrekt, Strike-Insert scheiterte drei Mal (BullMQ-Retries), User blieb korrekt EINFACH gebannt
(kein Doppel-Bann trotz drei Versuchen — Idempotenz-Beweis). Nach dem Fix: neuer Report loeste
einen frischen Job aus, der Strike + Notification korrekt anlegte.
**Nicht gebaut:** `createImageTicket` (media-ticket-dispatch) bleibt vorerst `.catch(() => {})` —
eigener, kleinerer Schritt (4/6).

## 2026-09-10 — feat(media): Media-Pipeline async — Raw-Upload + Worker-Processing (Phase 2, Punkt 2/6)
**Was:** `media.service.ts`s `uploadProfilePhoto` laedt jetzt die Rohdatei sofort unter dem finalen
Object-Storage-Key hoch (`Content-Type` = `file.mimetype`, keine Sharp-Verarbeitung mehr im
Request-Pfad), legt die `media_uploads`-Zeile sofort mit dieser (stabilen) `file_url` an und
enqueued einen Job auf die neue `media-processing`-Queue. Response-Shape unveraendert (kein
API-Vertragsbruch). `MediaProcessor` (`media.processor.ts`, Provider NUR in `WorkerModule`) laedt
die Rohdatei per neuem `downloadObject()`-Helper herunter, macht Resize+Watermark (aus
`media.service.ts` rausgezogen — MediaService braucht `sharp`/`SystemSettingsService`/`User`-Repo
seitdem nicht mehr) und ueberschreibt denselben Key — `file_url` bleibt stabil.
`common/queue/queue.constants.ts` neu: `MEDIA_PROCESSING_QUEUE`-Name + geteilte
`DEFAULT_JOB_OPTIONS` (3 Versuche, exponentielles Backoff, `removeOnComplete`/`Fail`-Limits) fuer
alle kuenftigen Queues.
**Gefundene Bugs unterwegs:** (1) `media.module.ts` hatte ein 15. `JwtModule.registerAsync`-
Duplikat, das der Shared-Auth-Modul-Schritt uebersehen hatte (fiel nicht in die 14er-Suche, weil
`JwtGuard` dort nie als eigener Provider gelistet war — funktionierte trotzdem, weil alle seine
Dependencies inzwischen global sind) — beim Vorbeikommen entfernt. (2) `WorkerModule`s Import von
`SystemSettingsModule` brach beim echten Boot-Test: das Modul bringt `JwtGuard` als Provider mit,
der `JwtService` braucht — aber `WorkerModule` importiert `SharedJwtModule` nicht (bewusst, der
Worker hat keine HTTP-Guards). Gefixt: nur `SystemSettingsService` direkt bereitstellen
(`TypeOrmModule.forFeature([...SystemSetting])` + Provider) statt das ganze Feature-Modul mit
seinem HTTP-Kram zu importieren.
**Verifiziert End-to-End** gegen echte Container (Postgres, Redis, MinIO, Worker, Backend): Foto
hochgeladen (630 KB PNG) → Response nach 98ms, `file_url` sofort gueltig. Wenige Sekunden spaeter:
Objekt unter derselben URL ist ein gueltiges WebP (586×714, Watermark sichtbar,
`file_size_kb` in Postgres korrekt aktualisiert auf 153). `seed-media`-erzeugte Alt-Daten im
persistenten MinIO-Volume als Testbild wiederverwendet.
**Nicht gebaut:** `createImageTicket` bleibt vorerst `.catch(() => {})` ohne Queue — das ist der
separate Schritt 4. Kein Loeschen/Aufraeumen der Rohdatei-Version (gibt es nicht getrennt — Worker
ueberschreibt direkt denselben Key, kein Zwischenobjekt uebrig).

## 2026-09-10 — feat(queue): BullMQ-Infra + eigener Worker-Prozess (Phase 2, Punkt 1/6)
**Was:** `bullmq` + `@nestjs/bullmq` installiert, `QueueModule` (`common/queue/`) konfiguriert die
geteilte BullMQ-Redis-Connection (`maxRetriesPerRequest: null`, wie von BullMQ verlangt — eigene
Connection, nicht der `REDIS_CLIENT` aus Phase 1, aber derselbe Redis-Host, kein neues Infra-Stück).
Beim Runterbrechen einen Bug im urspruenglichen Plan-Wortlaut gefunden (siehe Entscheidungs-
Korrektur in `docs/architecture.md`): Worker bootet ein eigenes, schlankes `WorkerModule`
(`src/worker.module.ts`, `src/worker.ts`) statt `AppModule` — sonst wuerden `@Processor`-Provider
in Feature-Modulen von BEIDEN Prozessen (API + Worker) instanziiert. Neue npm-Scripts
`start:worker`/`start:worker:dev` (ts-node, analog zu den Seed-Skripten — kein `nest-cli.json`-
Umbau noetig, `nest build` kompiliert den ganzen `src/`-Baum ohnehin). `worker`/`XXX_worker_load`-
Service in beiden Compose-Stacks (gleiches Image, `command` ueberschreibt `docker-entrypoint.sh`
— keine Seeds im Worker).
**Verifiziert:** `tsc -p tsconfig.build.json` kompiliert `worker.js`/`worker.module.js` fehlerfrei
in ein Scratch-`outDir` (der echte `dist/`-Ordner ist weiterhin root-owned von einem frueheren
Lauf). `docker compose config` validiert beide Compose-Dateien. Worker gegen echte DB+Redis
gestartet: bootet unabhaengig, "Worker gestartet — verbunden mit DB und Redis, wartet auf Jobs."
Sauber heruntergefahren.
**Nicht gebaut:** noch keine Queues registriert (`BullModule.registerQueue(...)`) und keine
`@Processor`-Klassen — reine Infra fuer diesen Schritt, die vier konkreten Jobs (Media, GDPR,
AutoSuspend, MediaTicket) kommen in den naechsten Schritten. S3-Env-Vars noch nicht im
Worker-Service der Compose-Dateien (erst noetig ab dem Media-Pipeline-Schritt, wird dort ergaenzt
statt jetzt auf Vorrat).

## 2026-09-10 — docs(architecture): Phase 2 durchdacht, fünf Design-Entscheidungen getroffen
**Was:** Recherche-Fork gegen `gdpr.service.ts`, `moderation.service.ts` (`checkAutoSuspend`),
`media.service.ts` (`createImageTicket`), `MediaUpload`-Entity, bcrypt-Callsites und BullMQ-
Kompatibilität durchgeführt, dann vier Design-Fragen dem User vorgelegt (Media-Async-Mechanismus,
GDPR-Zustellung, AutoSuspend-Idempotenz, bcrypt-Scope) — alle vier auf die empfohlene Option
entschieden. Fünfte, kleine Entscheidung selbst getroffen (`createImageTicket` auch über die
Queue, da Infra ohnehin entsteht). Ergebnisse in `docs/architecture.md` (Roadmap + Entscheidungen)
festgehalten, bevor der erste Code-Schritt beginnt.
**Nicht gebaut:** noch kein Code — reine Planungs-Doku, analog zum ersten Schritt der Session.

## 2026-09-10 — test: voller docker-compose-Boot-Test für Phase 1
**Was:** `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` in die lokale `.env` eingetragen (Werte aus
`.env.example`), dann `docker compose up -d --build` gegen den kompletten Demo-Stack (Postgres,
Redis, MinIO, Backend, Frontend). Ergebnis: `Nest application successfully started`, alle Seeds
inkl. `seed-media` liefen durch (95 User × 3 Uploads landeten im MinIO-Bucket, per HTTP 200
abrufbar). `GET /api/v1` → 200. Register + Login + `GET /auth/me` end-to-end getestet:
`user:exists:{id}` und `last_active:dirty`/`last_active:ts:{id}` erschienen korrekt in Redis, nach
~60s hat der `@Cron`-Flush den Dirty-Set geleert und `profiles.last_active_at` stand korrekt in
Postgres. `ThrottlerStorageRedisService` schreibt sichtbar Hash-Keys nach Redis. Damit ist die
gesamte Phase 1 (nicht nur einzeln gegen Wegwerf-Container, sondern im echten App-Kontext)
verifiziert. Sauber mit `docker compose down` heruntergefahren, Working Tree danach unveraendert
(nur das bekannte Railway-WIP als Diff).
**Nicht gebaut:** `settings:*`-Redis-Keys nicht im Live-Test beobachtet (kein Codepfad im Testlauf
hat `SystemSettingsService.getNumber/getString` ausgeloest) — bereits im vorigen Schritt separat
gegen echtes Redis verifiziert, hier kein Nachtest noetig.

## 2026-09-10 — refactor(auth): Shared-Auth-Modul — JwtModule-Duplikat über 14 Module beseitigt
**Was:** `JwtModule.registerAsync({...})` war identisch in 14 Feature-Modulen kopiert (Auth, Chat,
GDPR, Moderation, Teeth, Badge, Admin, Payment, Coin, Matching, Beef, Notifications,
System-Settings, Profile). Jetzt eine Registrierung in `common/auth/shared-jwt.module.ts`,
`@Global()` wie `RedisModule`/`LastActiveModule` — einmal in `AppModule` importiert, `JwtService`
danach ueberall automatisch verfuegbar. Alle 14 Module verloren den Block ersatzlos (kein neuer
Import noetig, das ist der Sinn von `@Global()`); `coin.module.ts` hatte zusaetzlich eine
verwaiste, redundante `ConfigModule,`-Zeile (ConfigModule ist ohnehin `isGlobal: true` in
`AppModule`) — beim Vorbeikommen mitentfernt.
**Verifiziert:** `tsc --noEmit` sauber über alle 15 geaenderten Dateien. Kein vollstaendiger
Boot-Test in dieser Session (haette `.env` um `MINIO_ROOT_USER`/`PASSWORD` ergaenzen muessen, die
dort noch fehlen seit dem MinIO-Schritt) — strukturell identisch zum bereits laufenden
`RedisModule`/`LastActiveModule`-Pattern, daher kein neues Risiko eingeschaetzt. Voller
Boot-Test folgt beim naechsten `docker compose up` des Users.
**Nicht gebaut:** keine Aenderung an den einzelnen `JwtGuard`/`OptionalJwtGuard`-Registrierungen
in den 14 Modulen (die bleiben als Provider dort — nur die JWT-Config-Duplizierung war der
Roadmap-Punkt, nicht die Guard-Registrierung selbst).
**Damit ist Phase 1 (Stateless) komplett** — alle 7 Punkte aus der Roadmap erledigt.

## 2026-09-10 — feat(system-settings): Cache nach Redis, Misses mitgecacht
**Was:** `SystemSettingsService`s Prozess-lokaler `Map`-Cache cachte nur Hits — jeder Call fuer
einen nie in der DB gesetzten Key (haeufig bei Fallback-Defaults, z.B.
`game.move_timeout_seconds` aus `beef-game.service.ts`) ging bei jedem Aufruf gegen Postgres.
Ganzer Cache nach Redis (`settings:{key}`, 60s TTL, `MISS_SENTINEL` fuer gecachte Misses).
Nebeneffekt der Redis-Migration: `set()` invalidiert jetzt den geteilten Cache — alle Instanzen
sehen eine geaenderte Config sofort statt jede fuer sich bis zu 60s zu warten (vorher war der Cache
ohnehin schon prozesslokal-inkonsistent zwischen Instanzen, nur nicht explizit als Bug benannt).
Verifiziert gegen echten Redis-Container: 5 Calls fuer einen fehlenden Key → nur 1 simulierter
DB-Call, `set()`-Invalidierung entfernt den Cache-Eintrag korrekt. TS-Build sauber.
**Nicht gebaut:** kein Cache-Warming, keine Pub/Sub-Invalidierung zwischen Instanzen (die
TTL-basierte Konsistenz — max. 60s Drift zwischen Redis-Write und naechstem Read — reicht fuer
owner-konfigurierbare Werte wie Preise/Timeouts).

## 2026-09-10 — feat(auth): jwt.guard entlastet — Redis-Cache + gebatchtes last_active
**Was:** `SELECT EXISTS (... FROM users ...)` lief bisher auf JEDEM authentifizierten Request
(Hot-Path von ~27 Dateien) — jetzt `user:exists:{id}` in Redis gecacht, 15-Min-TTL (akzeptiertes
Staleness-Fenster, explizit so im Plan vorgesehen). `last_active_at` lief bisher als
fire-and-forget-`UPDATE` pro Request — jetzt schreibt `LastActiveService.touch()` nur nach Redis
(`SET` + `SADD` in ein "dirty"-Set), ein neuer `@Cron(EVERY_MINUTE)` `flush()` liest das Set und
bulk-updated Postgres in einer Query (`unnest($1::uuid[])`). `LastActiveModule` ist `@Global()`
wie `RedisModule` — noetig, weil `JwtGuard`/`OptionalJwtGuard` als Provider in 14 Modulen einzeln
deklariert sind statt über ein gemeinsames Modul (das ist der separate Punkt "Shared Auth-Modul").
Token-Extraktion + der neue gecachte Exists-Check liegen jetzt geteilt in
`common/guards/jwt-verify.helper.ts` (plain functions) — beide Guards riefen vorher exakt
denselben Code dupliziert auf. Verifiziert: TS-Build sauber, Redis-Sequenzen (Cache-Miss/Hit/TTL,
Dirty-Set add/remove) gegen echten Redis-Container durchgespielt.
**Nicht gebaut:** kein aktives Invalidieren des Exists-Cache bei Ban/Delete — das 15-Min-Fenster
ist eine bewusste, im Plan explizit genannte Abwägung, kein Bug. Kein Locking zwischen
`flush()`s SMEMBERS-Read und SREM-Write — ein Touch in der Luecke wird beim naechsten Flush einfach
erneut aufgenommen, ausreichend fuer eine "letzte Aktivitaet"-Anzeige. `JwtModule.registerAsync`-
Duplikat über die 14 Module NICHT angefasst — eigener Roadmap-Punkt (Shared Auth-Modul).
`npm run build` liess sich nicht gegenpruefen (`dist/` root-owned von einem frueheren
Container-Lauf, EACCES) — `tsc --noEmit` lief sauber durch, als Ersatznachweis ausreichend.

## 2026-09-10 — feat(media): Object Storage statt lokalem Dateisystem
**Was:** `src/common/storage/object-storage.helper.ts` (plain functions, kein DI — mirrored auf
`crypto.helper.ts`, damit auch Standalone-Seed-Skripte es importieren koennen) mit `@aws-sdk/client-s3`
gegen einen S3-kompatiblen Endpoint (`forcePathStyle: true` fuer MinIO/R2/B2). `media.service.ts`
(`uploadProfilePhoto`) und `profile.service.ts` (`uploadProfileAudio`) schreiben jetzt dorthin statt
`fs.mkdirSync`/`fs.writeFileSync` gegen `process.cwd()`. `demo-seed.ts`s `seedMediaFile` ebenfalls
migriert (User-Entscheidung: Seeds direkt mit) inkl. MIME-Type-Mapping und Fix der
https-Constraint-Drop-Logik (pruefte vorher `BACKEND_URL`, jetzt korrekt `S3_PUBLIC_URL_BASE` —
das sind seit diesem Schritt zwei unabhaengige Variablen). `seed-media.ts` brauchte keine Aenderung:
schreibt nur Fake-`file_url`-Strings in die DB, nie echte Dateien.
Lokal: MinIO in `docker-compose.yml` und `docker-compose.loadtest.yml` (User-Entscheidung), je ein
`minio`- und ein `minio-init`-Einmal-Container (`minio/mc`, legt Bucket an + setzt Public-Read).
Provider fuer Railway-Prod (R2 vs. B2) bewusst offen gelassen (User-Entscheidung) — Code ist
provider-agnostisch ueber Env-Vars, nur die tatsaechlichen Credentials/Endpoint fehlen noch.
Verifiziert End-to-End gegen echtes MinIO (Upload via SDK, Abruf per HTTP-Fetch — 200, Inhalt
korrekt) und TS-Build sauber.
**Nicht gebaut:** kein Loeschen alter Dateien beim Ersetzen (Foto/Audio-Replace markiert die alte
`media_uploads`-Zeile als `REJECTED`, loescht aber das Objekt nicht — exakt das bisherige Verhalten,
keine Verschlechterung). Kein Umbau von `main.ts`s `useStaticAssets('/uploads')` — write-seitig
schreibt jetzt nichts mehr dorthin, aber die Zeile anzufassen haette `app.module.ts`/`main.ts`
(euer Railway-WIP) erneut beruehrt fuer minimalen Nutzen (leeres Verzeichnis, keine Fehlfunktion).
Kein Presigned-URL/Moderation-Gating vor Public-Read — identisch zum bisherigen Verhalten (Datei
war schon vorher sofort oeffentlich per `/uploads` erreichbar, unabhaengig vom moderation_status).

## 2026-09-10 — feat(rate-limit): Rate-Limiting nach Redis
**Was:** `setup.controller.ts`s permanenter Prozess-Map-Counter → `redis.incr()`, identische
Semantik (5 erlaubt, 6. blockiert), jetzt aber geteilt statt bei jedem Neustart zurueckgesetzt.
Globaler `ThrottlerGuard` (`app.module.ts`) nutzt jetzt `ThrottlerStorageRedisService` aus
`@nest-lab/throttler-storage-redis` (neue Dependency — User-Entscheidung nach Lizenz-/Maintainer-
Check: MIT, jmcdo29/nest-lab, passende Peer-Deps) mit dem geteilten `REDIS_CLIENT`. Verifiziert:
TS-Build sauber, `ThrottlerStorageRedisService.increment()` und der Setup-Counter beide direkt
gegen einen echten Redis-Container durchgespielt (Limit greift korrekt, Block-Duration korrekt).
**Nicht gebaut:** kein eigener Rate-Limit-Algorithmus (bewusst fertiges Paket statt Sliding-Window
selbst schreiben — User-Entscheidung), kein TTL auf dem Setup-Counter (war vorher auch permanent,
unveraendertes Verhalten).

## 2026-09-10 — feat(beef): Reaction-Ready-State nach Redis, TicTacToe-Timer-Bug gefixt
**Was:** `reactionReadyPlayers`-Map (Prozess-lokal, bricht bei zwei Instanzen sofort — Spieler A
und B koennten auf verschiedenen Instanzen landen) durch Redis-Set ersetzt (`SADD`/`SCARD`/
`EXPIRE` 5 Min. Safety-TTL). Dabei per Code-Review gefunden: `applyRandomTttMove` prüfte
`move_deadline_at` nicht, bevor es einen Zufallszug setzt — ein auf Instanz A gestellter 25s-Timer
konnte nach einem regulaeren Move auf Instanz B trotzdem noch feuern und einen zweiten,
ungueltigen Zug drueberlegen. Gefixt mit demselben Deadline-Check, den der Cron-Backstop
(`handleExpiredMoveDeadlines`) schon nutzt. Verifiziert: TS-Build sauber, Redis-Sequenz
(SADD/dup-SADD/SCARD/DEL/TTL) gegen echten Redis-Container durchgespielt.
**Nicht gebaut:** TicTacToe-Turn-Timer selbst bleibt ein lokaler JS-Timer-Handle (`tttTurnTimers`)
statt "Redis-Keys/TTL" wie im Plan wörtlich formuliert — ein Timer-Handle kann nicht in Redis
liegen, und `move_deadline_at` in Postgres ist bereits die geteilte Wahrheit; Redis-Keyspace-
Notifications dafür einzuführen wäre mehr Komplexität ohne Mehrwert gegenüber dem jetzigen
Deadline-Guard. Auch entdeckt, aber bewusst nicht angefasst: alle `@Cron`-Jobs in
`beef.scheduler.ts` laufen auf jeder Instanz unabhaengig — bei mehreren Instanzen verarbeitet
jede denselben abgelaufenen Beef parallel (kein verteilter Lock). Kein Teil dieses Roadmap-Punkts,
aber relevant für "echtes Horizontal" — als offener Punkt in der Rework-Tabelle vermerkt.

## 2026-09-10 — feat(redis): Phase-1-Auftakt — Redis-Infra
**Was:** Globales `RedisModule` (`ioredis`, `REDIS_CLIENT`-Token, `onModuleDestroy` disconnected)
in `AppModule` verdrahtet; `redis`-Service in `docker-compose.yml` und ein isolierter
`XXX_redis_load` in `docker-compose.loadtest.yml` (User-Entscheidung: beide Stacks jetzt,
ioredis statt node-redis wegen BullMQ in Phase 2). `app.module.ts`/`.env.example` waren Teil
eures uncommitteten Railway-WIP — meine zwei Zeilen dort wurden isoliert committet (HEAD-Version
+ nur meine Zeilen), euer Rest-Diff (AppController/Cookie-Vars) blieb unangetastet im Working Tree.
**Nicht gebaut:** noch kein Verbraucher (Beef-Game-State/Rate-Limiting folgen als nächste
Roadmap-Punkte), keine Persistenz-Volume für Redis (bewusst ephemer für State/Cache/Queue), keine
Railway-Produktions-Redis-Instanz verdrahtet (folgt, sobald ein Verbraucher existiert).
**Prozess-Notiz:** Dieser Log-Eintrag kam nach dem Feature-Commit statt im selben Commit — Regel-
Verstoss, hier nachgetragen statt amended.

## 2026-09-10 — docs(architecture): Phase 0 als erledigt markieren
**Was:** Fertig-Kriterium aus dem Plan geprüft: `docker build -f db/Dockerfile` + Run gegen ein
leeres, temporaeres Volume (kein bestehendes Compose-Volume angefasst) erzeugt alle 45 Tabellen,
`pseudonymize_user` und 9 Trigger ohne Fehler. Roadmap-Abschnitt in `docs/architecture.md` auf
Phasen-Status umgestellt (die alte `.scratch/`-Referenz war falsch — der Ordner existiert nicht,
es gibt keine separate Tracking-Datei).
**Nicht gebaut:** keine neue Tracking-Datei fuer den Roadmap-Status — der Stand steht direkt in
`docs/architecture.md`.

## 2026-09-10 — fix(deploy): Schema-Baseline-Regression in Railway-WIP behoben
**Was:** Der Schema-Konsolidierungs-Commit hatte `db/schema.sql` nach
`migrations/001_baseline.sql` verschoben, ohne dass `scripts/deploy/ensure-db.js`
(Railway-Boot-Guard, uncommittetes WIP) mitgezogen wurde — waere bei jedem
Fresh-Deploy mit `ENOENT` gecrasht. Pfad + Kommentare dort und in
`docs/deployment/railway.md` korrigiert. Nicht committet, da beide Dateien Teil
des laufenden Railway-WIP sind — Fix liegt im Working Tree, wird mit dem Rest
committet.
**Entscheidung:** `Dockerfile.railway` bleibt Single-Stage/root. Multi-Stage
braechte keinen Image-Vorteil (devDependencies muessen wegen ts-node-Seeds im
Entrypoint ohnehin im finalen Image bleiben) und wuerde die bereits dokumentierte
lokale Verifikation (`docs/deployment/railway.md`, "Was davon verifiziert ist")
ungueltig machen. Umbau auf einen spaeteren, eigenen Haertungsschritt verschoben.

## 2026-09-10 — chore(deploy): Railway als einzigen Deploy-Pfad festlegen
**Was:** `render.yaml` nach `_archive/render.yaml` verschoben (mit Begründungs-Header). Railway war
über `railway.json`/`Dockerfile.railway`/`docker-entrypoint.railway.sh` (WIP) ohnehin schon der
gelebte Pfad — Grund für die Wahl: Renders Managed-Postgres hat kein PostGIS, Railway löst das
bereits über das bestehende `db/Dockerfile` (Custom-Postgis-Image).
**Nicht gebaut:** kein neuer `deploy/`-Ordner für die aktiven Descriptoren (die liegen weiter flach
im Backend-Root, wie schon vor diesem Step) — nur ein `_archive/`-Ordner für das Ausgemusterte,
analog zu `migrations/_archive/`. `Dockerfile.railway` nicht auf Multi-Stage/non-root umgebaut —
das ist der noch offene Rest des Roadmap-Punkts, bewusst als separater Schritt gelassen, da er das
laufende Railway-WIP direkt anfasst.

## 2026-09-10 — chore(migrations): Schema-Baseline konsolidieren
**Was:** `db/schema.sql` (bereits ein aktueller `pg_dump --schema-only`-Snapshot, strukturell
verifiziert gegen Migrationen 023/037/038 und alle `schema_v4.sql`-Trigger) zu
`migrations/001_baseline.sql` gemacht statt eine neue Live-DB aufzusetzen und 42 Migrationen
manuell zu replayen — das Ergebnis wäre identisch gewesen, der replay-Pfad nur riskanter
(CP850-Encoding-Fallstricke aus 041/042). `migrations/002`–`043` + `schema_v4.sql` nach
`migrations/_archive/` verschoben; `db/Dockerfile`, `README.md`, `CLAUDE.md` und zwei
Seed-Kommentare auf den neuen Pfad umgestellt.
**Nicht gebaut:** keine Live-DB gestartet/migriert — reine Repo-Konsolidierung, keine
Produktions-DB betroffen. `docs/deployment/railway.md` (uncommittetes WIP) referenziert noch
`db/schema.sql` und wurde bewusst nicht angefasst — siehe Hinweis an den User.

## 2026-09-10 — docs(architecture): Zielarchitektur + Keep/Rework-Plan für Skalierungs-Rework
**Was:** Roadmap aus dem Architecture-Review in `docs/architecture.md` übernommen und um eine
verifizierte Keep/Rework-Tabelle ergänzt (42 Migrationen, `schema_v4.sql`/`db/schema.sql`, drei
Deploy-Descriptoren, Plaintext-`DB_HOST` in `render.yaml` — alles gegen den Code geprüft).
**Nicht gebaut:** keine ADR-Einträge für Redis/Queue/Object-Storage (kommen erst wenn die jeweilige
Phase umgesetzt wird), keine Code-Änderung — reine Planungs-Doku.
