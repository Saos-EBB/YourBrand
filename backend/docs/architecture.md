# Architektur

## Überblick

YourBrand-Backend ist ein NestJS-Monolith (+ Next.js Frontend), Postgres als System of Record.
Ziel-Umbau: horizontale Skalierbarkeit ohne Framework-Wechsel und ohne Microservice-Split — ein
Codebase, zwei Prozess-Rollen (API + Worker), Redis als geteilter Zustand/Cache/Queue,
Object Storage für Dateien. Ursache für den aktuellen Deckel: synchrone Single-Machine-Arbeit
(bcrypt, sharp, In-Memory-State) sitzt im Request-Handler und verhindert mehrere Instanzen.

Grundlage: Architecture Review (commit 93c5c56, 419 Files / 912 Nodes), Knowledge Graph,
eigene Loadtest-Messungen (`scripts/loadtest/`).

## Module

- `src/modules/core/*` — auth, profile, chat, notifications, moderation, admin, gdpr, media,
  payment, system-settings, setup, support, cities.
- `src/modules/hidden/*` — beef, coin, teeth, badge. Beef treibt Coin-Awards/-Spends per
  `CoinService`-Injection; Badge wird intern von `BeefService` erzeugt.
- `common/` — Guards, `crypto.helper.ts` (AES-256-CBC + SHA-256 Email-Hash), `rls.helper.ts`
  (`withRls`), `redis/` (globales `RedisModule`, `ioredis`), `storage/object-storage.helper.ts`
  (S3-kompatibel, plain functions wie `crypto.helper.ts`), `last-active/` (globales
  `LastActiveModule`), `auth/shared-jwt.module.ts` (globales `JwtModule.registerAsync`, ersetzt
  die 14-fache Kopie), zwei WebSocket-Gateways (`ChatGateway` default-namespace,
  `HiddenBeefGateway` `/hidden-beef`).
- Geplant neu: BullMQ `QueueModule`, ein Worker-Entrypoint (`start:worker`, gleicher Codebase).

## Datenfluss (Ziel)

```
Requests → Load Balancer (vom PaaS) → API-Instanz #1..N (zustandslos)
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              PostgreSQL             Redis (State/          Object Storage
              (Wahrheit)             Cache/Queue)            (Dateien)
                                          │
                                          ▼
                                    Worker 1+ (BullMQ, gleicher Code, start:worker)
```

Hot-Path (synchron, muss schnell sein): Token-Verifikation, Discover/Feed-Reads, WebSocket
Realtime, Coin-Balance. Cold-Path (async, darf langsam sein): Media-Verarbeitung, GDPR-Export,
Admin-Reports, Notification-/Mail-Fanout. bcrypt bleibt bewusst teuer, wird aber isoliert
(Worker-Threads), damit ein Login-Sturm nicht den geteilten libuv-Threadpool leerräumt, auf dem
auch `sharp` läuft (das erklärt die ~76/s-Wand aus dem Loadtest).

## Was bleibt (straight kopiert — Review lobt das explizit, nicht anfassen außer bei Bedarf)

| Teil | Warum bleibt es |
|---|---|
| PostgreSQL als System of Record | Transaktionen + RLS + Integrität für User/Profile/Consent/Matches/Zahlungen/Coin-Ledger. Kein NoSQL-Swap. |
| RLS für `profile_sensitive_data` + `rls.helper.ts` (`withRls`) | Richtig gebaut, regulatorisch heikel. |
| AES-256-CBC Email-Verschlüsselung (`crypto.helper.ts`) | Emails nie im Klartext — Storage per Blob, Lookup per SHA-256-Hash. |
| Coin-Ledger (`hidden/coin`) | Row-locked Balances, idempotente ON-CONFLICT-Upserts, precomputed-target-Trick gegen den CHECK. Finanziell heikelster Teil, korrekt gebaut. |
| NestJS + Next.js | Kein Framework-Befund im Review. Kopplung ist Nutzungsmuster, kein Framework-Mangel — lösbar durch Struktur. Ein Rewrite würde den sauberen Kern riskieren und den bcrypt-Ceiling trotzdem nicht fixen. |
| Event-Emitter Cross-Module-Pattern (`@nestjs/event-emitter`, `ChatGateway`/`HiddenBeefGateway`) | Entkoppelt Module sauber, kein direkter Service-Import nötig. |
| Modulkonvention `src/modules/<zone>/<name>/` | Trägt weiter, keine Struktur-Änderung nötig. |

## Was neu / umgebaut werden muss

| Teil | Ist-Zustand (verifiziert) | Ziel |
|---|---|---|
| ~~DB-Schema~~ | ~~42 einzelne Migrationen (`migrations/002`–`043`) + zwei parallele Schema-Dateien `schema_v4.sql` und `db/schema.sql`~~ | **Erledigt 2026-09-10:** `db/schema.sql` war bereits ein aktueller `pg_dump --schema-only`-Snapshot (verifiziert: enthält `matches`/`swipes` aus 037, `exile_until` aus 023, `contact_request_id` nullable aus 038, und *alle* PL/pgSQL-Trigger aus `schema_v4.sql` inkl. `pseudonymize_user` — schema_v4.sql war bereits vollständig überholt, kein manuelles Trigger-Portieren nötig). Umbenannt zu `migrations/001_baseline.sql`, 002–043 + `schema_v4.sql` nach `migrations/_archive/` verschoben, `db/Dockerfile` + README + CLAUDE.md + Seed-Kommentare auf den neuen Pfad umgestellt. |
| Deploy-Descriptoren | ~~Drei parallel: `render.yaml`, `railway.json` + `Dockerfile.railway`, `db/Dockerfile`/`Dockerfile`~~ | **Teilweise erledigt 2026-09-10:** Railway als der eine Pfad gewählt (Render-Postgres hat kein PostGIS, Railway löst das schon über `db/Dockerfile`s Custom-Image); `render.yaml` nach `_archive/` verschoben. **Bewusst zurückgestellt:** `Dockerfile.railway` bleibt Single-Stage/root — ist bereits lokal verifiziert (`docs/deployment/railway.md`), und devDependencies müssen wegen der ts-node-Seeds im Entrypoint ohnehin im finalen Image bleiben, Multi-Stage brächte keinen Größenvorteil. Umbau erst als eigener Härtungsschritt mit Re-Verifikation. |
| ~~`render.yaml`~~ | ~~`DB_HOST`/`DB_NAME`/`DB_USER` im Klartext im Repo (Passwörter korrekt als `sync: false`)~~ | **Erledigt 2026-09-10:** Datei archiviert, kein aktiver Pfad mehr — Secret-Sorge entfällt damit. |
| ~~Beef-Game-State (`beef-game.service.ts`)~~ | ~~In-Memory (Ready-Sets, Turn-Timer als Prozess-`Map`)~~ | **Erledigt 2026-09-10:** Reaction-Ready-Set → Redis (`SADD`/`SCARD`/`EXPIRE`, TTL als Leak-Schutz). TicTacToe-Turn-Timer bleibt bewusst ein lokaler JS-Timer (ein Timer-Handle kann nicht in Redis liegen) — dabei einen echten Multi-Instance-Bug gefunden und gefixt: `applyRandomTttMove` prüfte `move_deadline_at` nicht, ein auf Instanz A gestellter Timer konnte nach einem Move auf Instanz B noch einen zweiten, ungültigen Zufallszug draufsetzen. Jetzt derselbe Deadline-Check wie im Cron-Backstop — ein verwaister Timer wird zum sicheren No-Op statt zum Bug. |
| ~~Rate-Limiting~~ | ~~Prozess-lokale IP-Map (`setup.controller.ts`) + globaler Throttler ohne Shared-Store~~ | **Erledigt 2026-09-10:** `setup.controller.ts` nutzt jetzt `redis.incr()` (gleiche Semantik: 5 erlaubt, ab dem 6. Versuch blockiert, aber jetzt geteilt statt pro Prozess). Globaler `ThrottlerGuard` nutzt `ThrottlerStorageRedisService` (`@nest-lab/throttler-storage-redis`, MIT, ioredis-basiert) mit dem geteilten `REDIS_CLIENT` statt eigener Verbindung. Verifiziert gegen echten Redis-Container: Limit greift nach N Requests, Block-Duration korrekt. |
| ~~Media-Storage (`media.service.ts`, `profile.service.ts` uploadProfileAudio)~~ | ~~`fs.*Sync` gegen `process.cwd()` — überlebt keinen Container-Restart, kein Shared Storage~~ | **Erledigt 2026-09-10:** `src/common/storage/object-storage.helper.ts` (plain functions wie `crypto.helper.ts`, kein DI — auch von Standalone-Seed-Skripten importierbar), `@aws-sdk/client-s3` gegen S3-kompatiblen Endpoint (`forcePathStyle`, provider-agnostisch über Env-Vars: `S3_ENDPOINT`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_BUCKET`/`S3_PUBLIC_URL_BASE`). Provider für Railway-Prod (R2/B2) bewusst noch offen — User-Entscheidung vertagt. Lokal: MinIO in beiden Compose-Stacks (`minio`/`minio-init`, `XXX_minio_load`/`_init`), Bucket + Public-Read-Policy per `minio/mc`-Einmal-Container. `demo-seed.ts`s `seedMediaFile` ebenfalls migriert (User-Entscheidung: Seeds mit). Verifiziert End-to-End gegen echtes MinIO: Upload + öffentlicher HTTP-Fetch. |
| ~~`jwt.guard`~~ | ~~`SELECT EXISTS` pro Request + fire-and-forget `last_active`-Update, liegt auf Hot-Path von ~27 Dateien~~ | **Erledigt 2026-09-10:** `user:exists:{id}`-Redis-Cache mit 15-Min-TTL (akzeptiertes Staleness-Fenster laut Plan) statt `SELECT EXISTS` pro Request. `last_active_at` läuft über neue `LastActiveService` (`common/last-active/`): `touch()` schreibt nur nach Redis, ein `@Cron(EVERY_MINUTE)` `flush()` bulk-updated Postgres per `unnest()`. |
| ~~`optional-jwt.guard.ts`~~ | ~~Duplizierte Logik gegenüber `jwt.guard`~~ | **Erledigt 2026-09-10:** Token-Extraktion + gecachter Exists-Check jetzt in `common/guards/jwt-verify.helper.ts` geteilt (plain functions), beide Guards nutzen dieselbe Logik. Das `JwtModule.registerAsync`-Duplikat über 14 Module ist mit dem separaten Roadmap-Punkt "Shared Auth-Modul" (siehe unten) ebenfalls erledigt. |
| `hashEmail` | Zwei lokale Kopien neben `crypto.helper.ts` | Nur noch `crypto.helper.ts` |
| ~~`JwtModule.registerAsync`~~ | ~~~12 Zeilen kopiert in 14 Modulen~~ | **Erledigt 2026-09-10:** `common/auth/shared-jwt.module.ts` — eine Registrierung, `@Global()` wie `RedisModule`/`LastActiveModule`, einmal in `AppModule` importiert. Alle 14 Feature-Module brauchen den Block seitdem nicht mehr (kein neuer Import nötig — global heißt hier wirklich global). Verifiziert per `tsc --noEmit`; vollständiger Boot-Test folgt beim nächsten `docker compose up` des Users (dieselbe Struktur wie das schon laufende `RedisModule`/`LastActiveModule`, kein neues Risiko). |
| ~~system-settings-Cache~~ | ~~Cacht nur Hits (Prozess-lokaler `Map`)~~ | **Erledigt 2026-09-10:** Ganzer Cache nach Redis (`settings:{key}`, 60s TTL), Misses über `MISS_SENTINEL` mitgecacht — vorher ging jeder Call für einen nie gesetzten Key (z.B. Fallback-Defaults) bei jedem Request gegen Postgres. Nebeneffekt: `set()` invalidiert jetzt den geteilten Cache, alle Instanzen sehen die neue Config sofort statt jede für sich bis zu 60s zu warten. |
| ~~Media-Pipeline (`sharp`)~~ | ~~Synchron im Request~~ | **Erledigt 2026-09-10:** Raw-Upload sofort, `MediaProcessor` (nur `WorkerModule`) resized/watermarkt async und überschreibt denselben Object-Storage-Key. |
| ~~GDPR-Export~~ | ~~15 Queries + synchrones `pdfkit` auf dem Event-Loop~~ | **Erledigt 2026-09-10:** `GdprExportProcessor` (BullMQ, nur `WorkerModule`) übernimmt Queries + PDF-Build wortwörtlich unverändert. `GET /gdpr/export` antwortet sofort mit Bestätigung statt PDF-Stream (API-Vertragsänderung), Mail mit PDF-Anhang statt Link. `last_gdpr_export_at` wird erst nach erfolgreichem Mailversand gesetzt — ein fehlgeschlagener Job verbrennt nicht das 30-Tage-Fenster. |
| ~~`checkAutoSuspend`~~ | ~~Non-transaktionale Fire-and-forget-Chain mit `.catch(()=>{})`~~ | **Erledigt 2026-09-10:** `AutoSuspendProcessor` (BullMQ, nur `WorkerModule`), Ban/Strike-Schritte einzeln idempotent (Retry überspringt bereits erledigte Schritte statt alles neu zu machen oder alles zu überspringen). Dabei `migrations/002_seed_system_user.sql` gefunden+gefixt (siehe Entscheidungen). |
| ~~`createImageTicket`~~ (media-ticket-dispatch) | ~~`.catch(() => {})` ganz ohne Logging~~ | **Erledigt 2026-09-10:** `MediaTicketProcessor` (BullMQ, nur `WorkerModule`). Aus `ProfanityService` entfernt (war deren einziger Aufrufer), `ModerationModule`-Import aus `media.module.ts` damit auch überflüssig geworden. |
| ~~bcrypt~~ | ~~Lief im geteilten libuv-Threadpool, gleicher Pool wie `sharp`~~ | **Erledigt 2026-09-10:** eigener `piscina`-Worker-Thread-Pool (`common/bcrypt/`), alle `hash`/`compare`-Aufrufe (auth, admin, setup) laufen jetzt darüber statt direkt über das `bcrypt`-Package. Verifiziert per Loadtest: Ceiling von ~20–30 req/s auf ~70–90 req/s (≈3×). |
| `beef.scheduler.ts` — alle `@Cron`-Jobs | Jede Instanz führt jeden Cron unabhängig aus — bei N Instanzen verarbeitet jede denselben abgelaufenen Beef parallel, kein verteilter Lock (gefunden 2026-09-10 beim Beef-Game-State-Rework, nicht Teil dieses Punkts) | Verteilter Lock (z.B. Redis `SET NX`) oder nur eine Instanz führt Crons aus |
| ~~Redis~~ | ~~Existiert nicht~~ | **Infra erledigt 2026-09-10:** globales `RedisModule` (`ioredis`, `REDIS_CLIENT`-Token) in `AppModule`; `redis`-Service in `docker-compose.yml` (Demo) und `XXX_redis_load` in `docker-compose.loadtest.yml` (eigenes Netzwerk, analog zur Loadtest-DB). Noch kein Verbraucher — startet mit Beef-Game-State (nächster Punkt). |
| Queue / Object Storage | Existiert nicht | Neu: BullMQ `QueueModule`, S3-kompatibler Client, Worker-Entrypoint `start:worker` (Phase 2) |

Track-B-Punkte (Correctness-Bugs, God-Objects, Duplikate — siehe Roadmap unten) sind Fixes,
keine Rearchitektur; sie laufen parallel und blockieren die Tabelle oben nicht.

## Entscheidungen

- 2026-09-10 — Kein Framework-Wechsel, kein Microservice-Split, kein NoSQL-Swap für Postgres.
  Grund: kein Framework-Befund im Review; die eine Ursache (synchrone Arbeit im Request-Handler)
  lässt sich mit Redis/Queue/Object-Storage lösen, ein Rewrite würde den sauberen Kern (RLS,
  Email-Verschlüsselung, Coin-Ledger) unnötig riskieren.
- 2026-09-10 — Ein Codebase, zwei Prozess-Rollen (API + Worker via `start:worker`) statt zweitem
  Projekt/Repo. Grund: geteilte Types/Services/Entities, kein Deploy-Overhead für ein zweites Repo.
- 2026-09-10 — Media-Pipeline (Phase 2): Raw-Datei landet sofort unter dem finalen Object-Storage-
  Key statt hinter einem neuen Processing-Status. Grund: keine DB-Migration, `file_url` bleibt
  stabil. Akzeptierter Nachteil: ein Client, der die URL in der ersten Sekunde lädt, kann das
  unbearbeitete Bild cachen, bis der Worker das Objekt überschrieben hat.
- 2026-09-10 — GDPR-Export (Phase 2): PDF als Mail-Anhang statt Object-Storage-Link. Grund: die
  Datei enthält echte PII (entschlüsselte Email, Art.-9-Daten), das bestehende Object Storage ist
  aber public-read (siehe Media-Storage-Entscheidung) — ein Link dorthin wäre ein Datenleck. Mail
  als einziger Transportweg vermeidet ein zweites, privates Bucket samt Presigned-URL-Dependency.
- 2026-09-10 — `checkAutoSuspend` (Phase 2) wird beim Queue-Umbau idempotent gemacht (Check vor
  jedem der 4 Writes), nicht nur retry-fähig. Grund: BullMQ retried die ganze Funktion von vorn —
  ohne Idempotenz könnte ein Teilfehler zu doppeltem Bann/Strike/Mail führen.
- 2026-09-10 — **Bug + Fix:** `migrations/002_seed_system_user.sql` legt den Sentinel-System-User
  (`00000000-0000-0000-0000-000000000000`) an, den das Schema an mehreren Stellen voraussetzt
  (`pseudonymize_user()`, mehrere Views, `vulnerable_flag_audit.user_id`-Default), der aber nie
  tatsächlich in `users` existierte. `checkAutoSuspend` ist dadurch vermutlich seit Einführung
  immer an der FK auf `strikes.issued_by` gescheitert — unsichtbar, weil der Aufrufer den Fehler
  nur geloggt hat. Beim ersten echten End-to-End-Test dieses Schritts aufgefallen (Retry schlug
  wiederholt fehl), mit User-Bestätigung gefixt (DB-Migration).
- 2026-09-10 — **Korrektur:** Worker bootet `WorkerModule`, nicht `AppModule`. Der Plan-Text sagte
  "`NestFactory.createApplicationContext(AppModule)`" — das wäre ein Bug gewesen: `@Processor`-
  Provider in einem von `AppModule` importierten Feature-Modul würden dann von **beiden** Prozessen
  (API + Worker) instanziiert, da `main.ts` dasselbe `AppModule` bootet. `WorkerModule` ist eine
  eigene, schlanke Root-Modul-Definition (eigene `TypeOrmModule.forRootAsync`, `RedisModule`,
  `QueueModule` — kein HTTP, keine Controller/Guards/Gateways), Processors werden künftig nur dort
  registriert, nie in den von `AppModule` geladenen Feature-Modulen. "Ein Codebase, zwei
  Prozess-Rollen" bleibt gültig — nur eben zwei Root-Module statt einem.
- 2026-09-10 — **Bug + Fix:** `docker-compose.loadtest.yml`s MinIO-Service hieß `XXX_minio_load`
  (Unterstriche, analog zu `XXX_db_load`/`XXX_redis_load`) — funktionierte für `ioredis`/`pg`/
  `aws-sdk`, aber `mc` (Go, strengere Hostname-Validierung) lehnte den Namen mit "invalid hostname"
  ab, der `minio-load-init`-Bucket-Setup schlug fehl. Umbenannt zu `minio-load` (Bindestrich statt
  Unterstrich, wie das Demo-Stacks funktionierendes `minio`), alle Referenzen (S3_ENDPOINT in
  Backend + Worker, `MC_HOST_local`, `depends_on`) mitgezogen. Gefunden beim ersten echten Aufsetzen
  des Loadtest-Stacks für die Phase-3-Messung.
- 2026-09-10 — bcrypt-Isolierung (Phase 2) zurückgestellt bis nach der Phase-3-Neu-Messung. Grund:
  die im Plan genannte Threadpool-Konkurrenz mit `sharp` verschwindet automatisch, sobald `sharp`
  mit der Media-Pipeline in den Worker-Prozess wandert — ob dedizierte bcrypt-Isolierung danach
  noch etwas bringt, ist eine Messfrage, keine Annahme.
- 2026-09-10 — bcrypt-Isolierung: `piscina`-Worker-Thread-Pool statt `UV_THREADPOOL_SIZE`-Env-Var.
  Grund: User-Entscheidung gegen die empfohlene einfachere Variante — Rechnung (bcrypt-Kosten
  ~250ms × Pool-Groesse 4 ≈ gemessene ~20-30/s-Grenze) sprach zwar fuer die Env-Var, `piscina`
  entspricht aber dem urspruenglichen Plan-Wortlaut woertlicher und isoliert bcrypt vollstaendig
  von allem anderen im geteilten Threadpool (DNS, zlib, fs), nicht nur von `sharp`.

## Phase-3-Messung (2026-09-10)

Gemessen mit `scripts/loadtest/endpoint-rate.sh` (Mode 3) und `login-capacity.sh` (Mode 1) gegen
den frisch aufgesetzten Loadtest-Stack (`docker-compose.loadtest.yml`, 1000 geseedete User,
`nest start --watch`-Devmode — keine `start:prod`-Zahl). Client und Server liefen auf derselben
Maschine — absolute Zahlen sind daher eine untere Schätzung, kein Produktions-Benchmark; die
**Relation** zwischen den drei Werten (DB vs. API vs. bcrypt) ist trotzdem aussagekräftig.

**Methodik-Korrekturen unterwegs** (beide vor der eigentlichen Messung gefunden und gefixt):
- `/admin/media/pending` in der ersten Mode-3-Runde mitgetestet → 403 fürs fehlende Admin-Recht
  bei jedem Test-User, hat `AUTO_STOP` fälschlich bei 10/s ausgelöst. Endpoint aus der Auswahl
  raus, kein Kapazitätsproblem.
- `login-capacity.sh` sizes `users.csv` nach `MAX_RATE × STEP_SEC`, unabhängig von der tatsächlich
  geseedeten User-Zahl — mit `MAX_RATE=200` wuchs die Datei auf 1600 Zeilen, obwohl nur 1000 User
  existierten. Round-Robin traf User 1001–1600, die es nicht gibt → Burst aus `401 Ungültige
  Zugangsdaten`, sah aus wie ein Kapazitätseinbruch, war aber ein Test-Setup-Mismatch.
  `users.csv` explizit auf 1000 Zeilen neu erzeugt, danach sauber.

**Ergebnisse:**

| Was | Kapazität/Instanz | Engpass |
|---|---|---|
| Allgemeine Endpoints (Discover, Chat, Coin-Balance, Media-Upload, Contact-Requests — kein Login) | ~250–270 req/s bei ≥97 % Erfolg, Einbruch ab ~290/s | API-Prozess-CPU (Node Event-Loop), **nicht** die DB |
| Nur leichte Read-Endpoints (Discover, Chat-Liste, Coin-Balance) | 250/s bei 100 % Erfolg, sauber gehalten | API-CPU 90–125 % (>1 Kern ausgelastet), DB-CPU nur 45–48 % |
| Login (`POST /auth/login`, bcrypt) | ~20–30 req/s bei ~100 %, ab 30/s bereits 94,6 % + Avg-Latenz 2,4s | bcrypt/Threadpool — deutlich enger als alles andere |

**Kernaussage:** Die Datenbank ist bei keiner gemessenen Rate der Flaschenhals (44–48 % CPU auch
bei API-Sättigung) — das bestätigt die Grundannahme des ganzen Umbaus: mehr API-Instanzen sind
der richtige Hebel, nicht eine größere DB. bcrypt bleibt der mit Abstand engste Engpass und hat
sich durch den Media-Pipeline-Umzug (Schritt 2, Phase 2) **nicht** verbessert — die
Threadpool-Konkurrenz mit `sharp` war nie die Hauptursache, die zurückgestellte
bcrypt-Isolierung (Backlog) bleibt also ein echter, durch Zahlen belegter Kandidat.

**Hochrechnung (Beispiel, Annahmen explizit):** Angenommen 50.000 gleichzeitig aktive User
(Referenzgröße aus dem ursprünglichen Plan) erzeugen im Schnitt 1 Request alle 30 s
(≈ 1.667 req/s Gesamtlast, allgemeiner Traffic ohne Login-Sturm) → **1.667 / 260 ≈ 7 Instanzen**
für den allgemeinen Pfad. Ein Login-Sturm (z.B. viele User melden sich gleichzeitig neu an) ist
durch die ~20–30 req/s-bcrypt-Grenze pro Instanz der tatsächlich limitierende Fall, nicht der
allgemeine Traffic — die Annahme über gleichzeitige Logins bestimmt hier staerker die
Instanzenzahl als die 50k-Zahl selbst. Beide Annahmen (Request-Intervall, Login-Gleichzeitigkeit)
sind Platzhalter — mit echten Produktzahlen ersetzen, sobald vorhanden.

## Roadmap

Reihenfolge: Phase 0 ist Voraussetzung für Phase 1 (Stateless, schaltet Horizontal frei), danach
Phase 2 (Async: Worker + Queue) und Phase 3 (Messen & hochrechnen). Track B (Correctness +
Wartbarkeit aus der Tabelle oben) läuft parallel, blockiert nichts. Pro CC-Session ein Punkt,
Phase 0/1 strikt der Reihe nach, Track B frei dazwischen. DB-Migrationen und
Deploy-Pfad-Entscheidungen werden vor jedem Schritt einzeln bestätigt (workmode: DB-Migration =
immer fragen).

- **Phase 0 — Fundament: ✅ erledigt 2026-09-10.** Eine Schema-Baseline (`migrations/001_baseline.sql`),
  ein Deploy-Pfad (Railway), kein Plaintext-Secret im aktiven Pfad. Validiert: frischer
  `docker build -f db/Dockerfile` gegen leeres Volume erzeugt alle 45 Tabellen inkl.
  `pseudonymize_user` + 9 Trigger, ohne Fehler. Offen gelassen (bewusst, siehe Tabelle oben):
  `Dockerfile.railway` Multi-Stage/non-root.
- **Phase 1 — Stateless (Redis + Object Storage): ✅ komplett 2026-09-10.** Alle 7 Punkte laut
  Plan erledigt: (1) Redis, (2) Beef-Game-State, (3) Rate-Limiting, (4) Media → Object Storage,
  (5) `jwt.guard`, (6) system-settings-Cache, (7) Shared Auth-Modul. Details siehe "Was neu /
  umgebaut werden muss" oben. Damit ist Horizontal (mehrere API-Instanzen gleichzeitig) technisch
  möglich — offen bleibt die `beef.scheduler.ts`-Cron-Dopplung (siehe Tabelle) und die
  Dockerfile.railway-Härtung, beide bewusst zurückgestellt.
- **Phase 2 — Async (Worker + Queue): ✅ abgeschlossen 2026-09-10** (5 von 6 Punkten umgesetzt,
  Punkt 6 bewusst zurückgestellt — siehe unten).
  Design-Entscheidungen (siehe Entscheidungen unten): (1) BullMQ + `src/worker.ts` ✅ — eigenes,
  schlankes `WorkerModule` statt `AppModule` (siehe Korrektur unten), eigene Redis-Connection.
  (2) Media-Pipeline ✅: Raw-Upload sofort unter dem finalen Object-Storage-Key (`MediaService`),
  `MediaProcessor` (nur im `WorkerModule`) überschreibt nach Resize/Watermark dasselbe Objekt —
  keine Migration. End-to-End verifiziert: Upload-Response 98ms, Bild erscheint verarbeitet
  (resized + watermarkt, gültiges WebP) innerhalb weniger Sekunden unter derselben URL. (3)
  `checkAutoSuspend` → idempotenter Job ✅ (schließt Track-B "atomar machen" mit ab) — dabei einen
  vorbestehenden Bug gefunden und mit `migrations/002_seed_system_user.sql` gefixt (siehe
  Entscheidungen unten): der Sentinel-System-User existierte nie in `users`, jeder Auto-Suspend
  scheiterte an der FK auf `strikes.issued_by`, nur unsichtbar durch den verschluckten `.catch()`.
  End-to-End verifiziert (Schwelle testweise auf 2 gesenkt): kein Doppel-Bann bei fehlgeschlagenen
  Retries (Ban-Schritt idempotent übersprungen), Strike + Notification korrekt nach dem Fix. (4)
  `createImageTicket` ✅ über eigene `MediaTicketProcessor`-Queue (war reines Logging-Loch, keine
  echte Chain — kleinster der sechs Punkte). End-to-End verifiziert: Upload erzeugt korrekten
  `admin_tickets`-Eintrag, unabhängig vom parallel laufenden Media-Processing-Job. (5)
  GDPR-Export ✅ → Job, PDF als Mail-Anhang statt Object-Storage-Link (PII-Sensitivität, aktuelle
  Buckets sind public-read). End-to-End verifiziert: `GET /gdpr/export` antwortet sofort, Worker
  baut PDF + verschickt Mail erfolgreich, `last_gdpr_export_at` korrekt gesetzt, zweiter Versuch
  direkt danach wird korrekt mit 403 abgelehnt (Rate-Limit unverändert funktionsfähig). (6)
  bcrypt-Isolierung zurückgestellt bis nach Phase 3s Neu-Messung (sharp verlässt mit Schritt 2
  ohnehin den API-Prozess-Threadpool).
- **Phase 3 — Messen & hochrechnen: ✅ abgeschlossen 2026-09-10.** Ergebnisse siehe unten
  (eigene Sektion "Phase-3-Messung").
- **Track B (Correctness + Wartbarkeit):** parallel, jederzeit.

## Offene Punkte (Backlog)

Vollständige Liste, damit nichts aus dem ursprünglichen Plan verloren geht — Track B stand bisher
nur in der Plan-Nachricht, nie explizit im Repo. Neue Funde aus Phase 0–2 sind ergänzt. Reihenfolge
innerhalb einer Gruppe ist keine Priorität, nur Herkunft.

**Phase 2, Rest:**
- [x] bcrypt-Isolierung — **erledigt 2026-09-10** (`piscina`-Worker-Pool, siehe Entscheidungen +
  "Was neu / umgebaut werden muss" oben). Ceiling ~20–30 → ~70–90 req/s.

**Phase 3 — Messen & hochrechnen:** ✅ erledigt — siehe "Phase-3-Messung" unten.

**Aus Phase 0–2 zurückgestellt (kein neuer Scope, nur nicht sofort gemacht):**
- [ ] `Dockerfile.railway` Multi-Stage + non-root (Phase 0) — bereits lokal verifiziert,
  Umbau bräuchte Re-Verifikation.
- [ ] `beef.scheduler.ts`: alle `@Cron`-Jobs laufen unabhängig auf jeder Instanz, kein verteilter
  Lock — bei N API-Instanzen verarbeitet jede denselben abgelaufenen Beef parallel (gefunden beim
  Beef-Game-State-Rework, Phase 1).
- [ ] `createNicknameTicket` (`profanity.service.ts`) — dieselbe INSERT+Event-Struktur wie das
  gefixte `createImageTicket`, aber nicht Teil des Plans; kein bekanntes Fire-and-forget-Problem
  dort, nur beim Vorbeikommen aufgefallen.

**Track B — Correctness:**
- [x] Teeth-Race — **erledigt 2026-09-10:** `transform()` läuft jetzt in `dataSource.transaction()`
  mit `SELECT ... FOR UPDATE` (gleiches Muster wie `coin.service.ts`). Mit echter Postgres-Lock-
  Konkurrenz verifiziert (zwei parallele Transaktionen gegen 15 Zähne): die zweite blockiert auf
  dem Lock, sieht nach Commit der ersten korrekt 0 verfügbare Zähne und wirft die erwartete
  Exception — kein Doppel-Chain, Endzustand exakt 1 Chain + 0 unkonvertierte Zähne.
- [ ] Moderation-Access-Scope: `getReports`/`getStrikes` haben `@Roles('admin')`, filtern aber auf
  `req.user.sub` → Admin sieht nur eigene statt plattformweite Queue.
- [x] `checkAutoSuspend` atomar machen — **erledigt** in Phase 2 (idempotenter Job).
- [ ] Fehlende Indizes: `beef_votes(beef_id)`, `beef_comments(beef_id)`,
  `coin_transactions(user_id)`, `teeth(owner_id)`, `badges(expires_at)`.
- [ ] City-Search: leading-wildcard `ILIKE '%q%'` ohne Guard → Trigram-Index oder Prefix-Suche +
  Guard.
- [ ] Admin-`useSearch` sucht nur die geladene Seite (keine serverseitige Pagination); Debounce-
  Timeout beim Unmount clearen.

**Track B — Wartbarkeit:**
- [ ] `profile.service.ts` (887 Z., 11-Arg-Konstruktor) — `searchProfiles` (~235 Z.) rausziehen.
- [ ] `admin.service.ts` (Fan-out 22) — nach Concern splitten (Moderation / Settings / Reporting).
- [ ] `VerwaltungTab.tsx` (597 Z., ~40 `useState`) — pro Datenlader eine Komponente.
- [ ] Kopierte Konstanten (`COIN_TX_TYPES`, Package-Preise, `DEFAULT_PRICES`) aus einer Quelle
  importieren; Coin-Preise von compile-time → `SystemSettings`.
- [ ] Frontend-Types aus NestJS-DTOs generieren statt handkopieren.
- [ ] Enum-as-VARCHAR (`coin_transactions.type`, `beefs.status`) → echter Enum-Typ / Lookup-Tabelle
  (additiv, keine bestehende Spalte umbauen).
