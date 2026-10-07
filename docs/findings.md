# Findings — gut zu wissen

Was beim Bauen der Mandanten-Console aufgefallen ist, aber nicht (oder noch nicht) gefixt wurde.
Neue Einträge oben.

## 2026-10-07 — Logo-Upload (Schritt 7)

- **Logo/Favicon sind bis Schritt 8 nur in der Console sichtbar** — die App zeigt sie noch nicht an.
- **Neue Logos liegen in `tenants/<slug>/` und sind damit in git** (Binaerdateien, max. 2 MB). Bei
  vielen Logo-Wechseln waechst das Repo; ggf. spaeter Git LFS.
- **SVGs mit `<style>`/CSS werden durchgelassen** (nur Script, Event-Handler, `javascript:`,
  `<foreignObject>` und externe `href`/`src` werden abgelehnt). Im `<img>`-Tag kann CSS im SVG nichts
  ausfuehren; wird das SVG irgendwann inline eingebettet, neu pruefen.

## 2026-10-07 — Farb-Editor (Schritt 6)

- **Jeder Mandant unterschreitet WCAG AA (4,5:1) in mindestens einem Modus** — nachgerechnet mit den
  Paaren aus dem Editor:

  | Mandant | Modus | zu wenig Kontrast |
  |---|---|---|
  | default | dark (Standard) | Button-Text auf Primaer 3,8 |
  | default | light | Button 3,6 · Primaer-Text 4,4 · empfangene Bubble 4,4 |
  | kiez | light (Standard) | Primaer-Text 3,3 · empfangene Bubble 3,3 |
  | campus-match | light | Primaer-Text 3,0 · Bubble 3,0 |
  | miteinander | dark | Primaer-Text 3,1 · Bubble 3,1 |
  | underground | light | Primaer-Text 1,6 · Bubble 1,6 |

  Ursache: ein Token-Satz gilt fuer dark **und** light (`themeTokensCss`), eine Akzentfarbe passt
  selten auf beide Hintergruende. Nicht gefixt — Designentscheidung (getrennte Tokens pro Modus?).
- **`--color-primary-container` / `--color-secondary-container` werden im Frontend nicht benutzt**
  (nur in `globals.css` und der Dev-Palette `components/DevColorPalette.tsx`). Im Farb-Editor trotzdem
  gelistet, wirken aber nicht.
- **Empfangene Chat-Bubbles sind die Primaerfarbe, eigene sind neutral** (`chat/[id]/page.tsx`) —
  umgekehrt zu den meisten Messengern; gewollt?

## 2026-10-07 — Console-Editor (Schritt 5)

- **„Mandant neu starten“ ist ungetestet** — beim Bauen lief kein Mandanten-Stack. Es ist ein
  `docker restart` von Backend + Worker; erster echter Lauf bitte beobachten.
- **Gespeicherte `tenant.json` werden einheitlich formatiert** (2 Spaces, ein Key pro Zeile). Der erste
  Save von `tenants/default/tenant.json` (heute kompakt) zeigt deshalb mehr Diff als die eigentliche
  Aenderung.
- **Neue Keys landen am Ende der Datei** (z.B. `modules` nach `legal`) — JSON-Reihenfolge ist egal, nur
  optisch.
- **Auto-Commits laufen auf dem aktuellen Branch** — wer gerade auf einem Feature-Branch ist, committet
  Mandanten-Aenderungen dorthin.

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
