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
