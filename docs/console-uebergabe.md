# Mandanten-Console — Übergabe (Stand 2026-10-07)

## Starten

```bash
docker compose up -d XXX_db        # Postgres fuer die Stats (laeuft gerade schon)
cd backend && npm run console      # → http://localhost:3099
```

Einmalig nötig (ist erledigt): `npm ci` in `backend/` auf dem Host. Dafür war
`sudo chown $USER:$USER backend/node_modules` nötig, weil Docker den Ordner als root anlegt.

## Was die Console kann

| Bereich | Was |
|---|---|
| Übersicht | Alle Mandanten inkl. default: Logo, Name, Tier, Theme, Farben, Status (läuft/aus), Fehler in `tenant.json` |
| Stats | Button „Aktualisieren“ fragt alle Mandanten-DBs ab und speichert einen Snapshot (`.console/snapshots.jsonl`, nicht in git). Oben Summen über alle Mandanten |
| Detailseite | Klick auf eine Kachel: alle 16 Kennzahlen mit Veränderung seit dem letzten Stand, Klick auf eine Zahl zeigt den Verlauf |
| Editor | „Bearbeiten“: Name, Theme, Tier, Module, Sprachen, Impressum, Seed. „Prüfen“ zeigt Fehler und Diff, „Speichern & committen“ committet nur diese `tenant.json` |
| Farben | 19 Farb-Tokens mit Picker, Live-Vorschau dark + light, Kontrastprüfung (WCAG) |
| Logo | Drag & Drop oder Klick, PNG/JPG/WebP/SVG bis 2 MB. Favicon wird erzeugt, alles wird sofort committet |
| Neustart | Nach dem Speichern bzw. nach einem Logo-Upload: „Mandant neu starten“ (wenn er läuft). Nötig, weil das Backend `tenant.json` nur beim Start liest |
| App | Logo steht jetzt in Sidebar/Navbar vor dem Namen, Favicon im Browser-Tab |

## Commits (lokal, nichts gepusht)

```
61115a1 fix(console): offer tenant restart after logo upload
2cab38e feat(tenant): show tenant logo and favicon in the app
a7f907b feat(console): logo upload with generated favicon
18ac0fc feat(console): color token editor with live preview and contrast check
d9ff889 feat(console): tenant.json editor with validation, diff and auto-commit
94ce71e docs: add findings.md for things noticed but not fixed
7b844fe feat(console): stats snapshots with totals and per-tenant history
c4fdea6 feat(console): tenant console with overview of all tenants
e1e07de refactor(admin): extract dashboard stats queries into plain function
```

## Wie getestet

- Stats gegen die echte lokale DB, alle 5 Mandanten liefern Werte.
- Editor, Farben und Logo-Upload in einer Wegwerf-Kopie des Repos (git worktree) per Playwright
  durchgeklickt, damit keine Test-Commits in deinem Repo landen.
- Logo in der App am laufenden Kiez-Stack mit Test-Logo, Desktop und Mobil. Danach zurückgenommen und
  den Stack wieder gestoppt.

## Wichtigste Findings (vollständig: `docs/findings.md`)

- **Kontrast:** Jeder Mandant, auch default, liegt in mindestens einem Modus unter WCAG AA (4,5:1),
  am schlimmsten Underground im Light-Mode mit 1,6:1. Der Grund: Ein Farbsatz gilt für dark **und**
  light. Designfrage: getrennte Farben pro Modus?
- **Ungenutzte Farben:** `primary-container` und `secondary-container` stehen im Farb-Editor, die App
  nutzt sie aber nicht.
- **Neustart-Button ungetestet:** Beim Bauen lief kein Mandant dauerhaft. Den ersten echten Lauf
  beobachten.
- **Branch:** Auto-Commits landen auf dem Branch, auf dem du gerade bist.
- **Tests:** 3 Backend-Tests sind rot (TicTacToe ×2, `demo-seed-path`). Das waren sie schon vor der
  Console, nicht angefasst.
- **Format:** Gespeicherte `tenant.json` werden einheitlich formatiert. Der erste Save von `default`
  zeigt deshalb mehr Diff als die eigentliche Änderung.
- **Logos in git:** Logos liegen in git (Binärdateien). Bei vielen Wechseln wächst das Repo.
- **Status „aus“:** heißt, dass Backend- oder Frontend-Container nicht laufen. Für die Stats reicht
  Postgres.
- **Gleiche Stats:** Die 4 Showcase-Mandanten zeigen identische Stats (66 User), weil sie sich den
  Demo-Seed teilen.

## Zustand beim Verlassen

- `XXX_db` läuft (habe ich für die Stats gestartet).
- Keine Mandanten-Stacks laufen, die Console ist nicht gestartet.
- Working Tree ist sauber, diese Datei ist mit committet.

## Mögliche nächste Schritte (nicht gebaut)

- Getrennte Farb-Tokens für dark/light (würde das Kontrastproblem lösen).
- Raw-JSON-Tab im Editor, Wizard „neuer Mandant aus `_template`“.
- Snapshots automatisch (z. B. stündlich) statt nur per Button.
