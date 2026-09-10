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
  payment, system-settings, setup, support, cities. Jedes Modul deklariert `JwtModule.registerAsync`
  selbst (kopiert, ~12 Zeilen je Modul) — siehe Rework-Liste.
- `src/modules/hidden/*` — beef, coin, teeth, badge. Beef treibt Coin-Awards/-Spends per
  `CoinService`-Injection; Badge wird intern von `BeefService` erzeugt.
- `common/` — Guards, `crypto.helper.ts` (AES-256-CBC + SHA-256 Email-Hash), `rls.helper.ts`
  (`withRls`), zwei WebSocket-Gateways (`ChatGateway` default-namespace, `HiddenBeefGateway`
  `/hidden-beef`).
- Geplant neu: `RedisModule` (geteilter Zustand + Cache + BullMQ-Queue), `QueueModule`, ein
  Worker-Entrypoint (`start:worker`, gleicher Codebase), ein Object-Storage-Client (S3-kompatibel).

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
| DB-Schema | 42 einzelne Migrationen (`migrations/002`–`043`) + zwei parallele Schema-Dateien `schema_v4.sql` und `db/schema.sql`, alle außerhalb `migrations/` | *Eine* Baseline-Migration `001_baseline.sql` per `pg_dump --schema-only`; alte Migrationen nach `migrations/_archive/`; PL/pgSQL-Trigger aus `schema_v4.sql` (pseudonymize_user, Consent-Cascades) in die Baseline übernehmen |
| Deploy-Descriptoren | Drei parallel: `render.yaml`, `railway.json` + `Dockerfile.railway`, `db/Dockerfile`/`Dockerfile` | Einen Pfad wählen (Railway *oder* Render), Rest archivieren; Prod-Dockerfile (multi-stage, non-root) als *der* Dockerfile |
| `render.yaml` | `DB_HOST`/`DB_NAME`/`DB_USER` im Klartext im Repo (Passwörter korrekt als `sync: false`) | Host/Name in Env-Var/Secret |
| Beef-Game-State (`beef-game.service.ts`) | In-Memory (Ready-Sets, Turn-Timer als Prozess-`Map`) | Redis-Keys/TTL — Instanzen teilen den Zustand |
| Rate-Limiting | Prozess-lokale IP-Map (`setup.controller.ts`) + globaler Throttler ohne Shared-Store | Redis-Store — Limit gilt über alle Instanzen |
| Media-Storage (`media.service.ts`, `profile.service.ts` uploadProfileAudio) | `fs.*Sync` gegen `process.cwd()` — überlebt keinen Container-Restart, kein Shared Storage | S3-kompatibles Object Storage (R2/B2/MinIO) |
| `jwt.guard` | `SELECT EXISTS` pro Request + fire-and-forget `last_active`-Update, liegt auf Hot-Path von ~27 Dateien | Redis-Lookup (oder dokumentiertes 15-Min-Fenster), `last_active` in Redis gebatcht |
| `optional-jwt.guard.ts` | Duplizierte Logik gegenüber `jwt.guard` | Gegen dieselbe (entlastete) Logik teilen |
| `hashEmail` | Zwei lokale Kopien neben `crypto.helper.ts` | Nur noch `crypto.helper.ts` |
| `JwtModule.registerAsync` | ~12 Zeilen kopiert in jedem Modul | Ein importierbares Shared-Auth-Modul |
| system-settings-Cache | Cacht nur Hits | Auch Misses cachen (Redis) |
| Media-Pipeline (`sharp`) | Synchron im Request | Rohdatei sofort in Object Storage, Job in Queue, Worker resized async |
| GDPR-Export | 15 Queries + synchrones `pdfkit` auf dem Event-Loop | Background-Job (BullMQ), Link per Mail |
| Notification-/Mail-Fanout (`checkAutoSuspend`, media-ticket-dispatch) | Non-transaktionale Fire-and-forget-Chain mit `.catch(()=>{})` | Job, retry-bar |
| bcrypt | Läuft im geteilten libuv-Threadpool, gleicher Pool wie `sharp` | Worker-Thread / eigener Pfad, isoliert vom Media-Threadpool |
| Redis / Queue / Object Storage | Existiert nicht | Neu: `RedisModule`, BullMQ `QueueModule`, S3-kompatibler Client, Worker-Entrypoint `start:worker` |

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

Siehe `.scratch/` bzw. Handoff-Notizen für den Ausführungsstand. Reihenfolge: Phase 0 (Fundament:
eine Schema-Wahrheit + ein Deploy-Pfad) ist Voraussetzung für Phase 1 (Stateless: Redis + Object
Storage, schaltet Horizontal frei), danach Phase 2 (Async: Worker + Queue) und Phase 3 (Messen &
hochrechnen). Track B (Correctness + Wartbarkeit aus der Tabelle oben) läuft parallel, blockiert
nichts. Pro CC-Session eine Phase-Zeile, Phase 0/1 strikt der Reihe nach, Track B frei dazwischen.
DB-Migrationen und Deploy-Pfad-Entscheidungen werden vor jedem Schritt einzeln bestätigt (workmode:
DB-Migration = immer fragen).
