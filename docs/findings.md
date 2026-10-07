# Findings — gut zu wissen

Was beim Bauen der Mandanten-Console aufgefallen ist, aber nicht (oder noch nicht) gefixt wurde.
Neue Einträge oben.

## 2026-10-07 — Mandanten-Console (Schritte 1–3)

- **`brand.logo` / `brand.favicon` werden im Frontend nirgends angezeigt.** Die Felder stehen im
  Schema (`backend/src/common/tenant/tenant-config.schema.ts`), Navbar/Sidebar zeigen aber fest den
  `HiddenLogoButton`. Wird im Console-Logo-Schritt mit erledigt.
- **3 Backend-Tests rot, schon vor der Console:** `tictactoe.handler.spec.ts` (2×: „initiator wins
  series 2-0“, „draw resets board without awarding score“) und `demo-seed-path.spec.ts` („alle
  Nicknames in demo-relations.yaml existieren“). Nicht angefasst.
- **`tsc --noEmit` meldet Typfehler in `rps.handler.spec.ts`** (Zeilen 10/11: `string` nicht
  `RpsChoice`). Vorbestehend, Jest laeuft trotzdem.
- **`backend/dist/` und (bis zum `chown`) `backend/node_modules/` gehoeren root** — Docker legt sie
  als Mountpunkte an. Folge: `npm ci` / `tsc` auf dem Host scheitern mit `EACCES`. Fix fuer
  node_modules: `sudo chown $USER:$USER backend/node_modules`; `dist/` ist nur fuer `tsc`-Buildinfo
  relevant.
- **Console braucht `npm ci` in `backend/` auf dem Host** (das Backend selbst laeuft nur im
  Container) und einen laufenden `XXX_db` (`docker compose up -d XXX_db`) fuer die Stats.
- **Status „aus“ heisst: Backend- oder Frontend-Container laeuft nicht** — Postgres allein reicht
  fuer Stats, nicht fuer „laeuft“.
- **Die 4 Showcase-Mandanten zeigen identische Stats** (je 66 User) — gewollt, sie teilen sich den
  Demo-Seed (`tenants/README.md`, „Demo-Daten“).
- **Bestehender Code ist nicht prettier-formatiert** (4 statt 2 Spaces, `npm run lint` wuerde ganze
  Dateien umschreiben). Neuer Code folgt dem Stil der Umgebung, nicht prettier.
