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
