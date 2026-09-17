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
