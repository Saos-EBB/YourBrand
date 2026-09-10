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
