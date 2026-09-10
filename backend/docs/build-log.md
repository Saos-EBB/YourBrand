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
