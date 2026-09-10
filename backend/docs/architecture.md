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
| Media-Pipeline (`sharp`) | Synchron im Request | Rohdatei sofort in Object Storage, Job in Queue, Worker resized async |
| GDPR-Export | 15 Queries + synchrones `pdfkit` auf dem Event-Loop | Background-Job (BullMQ), Link per Mail |
| Notification-/Mail-Fanout (`checkAutoSuspend`, media-ticket-dispatch) | Non-transaktionale Fire-and-forget-Chain mit `.catch(()=>{})` | Job, retry-bar |
| bcrypt | Läuft im geteilten libuv-Threadpool, gleicher Pool wie `sharp` | Worker-Thread / eigener Pfad, isoliert vom Media-Threadpool |
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
- **Phase 2 — Async (Worker + Queue):** danach.
- **Phase 3 — Messen & hochrechnen:** danach.
- **Track B (Correctness + Wartbarkeit):** parallel, jederzeit.
