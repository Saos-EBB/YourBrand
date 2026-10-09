# Findings — gut zu wissen

Was beim Bauen der Mandanten-Console aufgefallen ist, aber nicht (oder noch nicht) gefixt wurde.
Neue Einträge oben.

## 2026-10-09 — Mandanten-Designs, Schwarzes Brett, Betreuung

- **YourBrand hatte nie seine Schrift** — die next/font-Variablen hingen an `<body>`, `--font-sans`
  aus `@theme` wird aber auf `:root` aufgelöst. Ergebnis: überall Systemschrift statt Plus Jakarta Sans.
  Gefixt (Variablen jetzt auf `<html>`), die App sieht dadurch etwas anders aus als vorher.
- **Heller Modus hatte immer auch `dark` am `<html>`** — `useHiddenZone` setzte beim Verlassen der
  Hidden Zone `savedTheme ?? 'dark'`, also bei jedem Laden ohne Zone ein zusätzliches `dark`. Fiel nur
  nicht auf, weil die hellen Regeln später im CSS stehen. Gefixt (nur wiederherstellen, was gespeichert war).
- **Stray `was` im ChatController** — eine einzelne Zeile `was` vor `@Get('requests/incoming')`,
  kompilierte als Klassen-Property. Entfernt.
- **Console-Farbeditor arbeitet jetzt pro Modus** — Umschalter „beide Modi / nur dark / nur light“,
  startet im Standard-Modus des Mandanten. Layout-Felder (`theme.layout`) hat der Editor nicht, die
  bleiben beim Speichern aber erhalten (der Editor schreibt die ganze `tenant.json` zurück).
- **„Für Sie schreiben“ ist nicht gebaut** — `managed_accounts.can_write_chat` gibt es im Schema, die
  Betreuung kann aber nur lesen. Bewusst: im Namen anderer schreiben braucht ein eigenes Konzept
  (Kennzeichnung der Nachricht, Einwilligung). Die UI sagt „Für Sie schreiben darf niemand“.
- **Umkreis im Brett ist ungenau** — Profile kennen nur die Stadt (`profiles.location` = Stadtmitte).
  „Straße“ ist darum 150 m um diesen Punkt, nicht die echte Straße. Für die Demo hängen die Aushänge
  rund um den Ort des Owners, sonst wären sie in einem echten Umkreis unsichtbar.
- **Rechtstexte fürs Brett sind Entwürfe** — AGB § 7 und Datenschutz 4.3 stehen jetzt auf `/agb` und
  `/datenschutz` (nur mit Modul `board`), sind aber nicht juristisch geprüft. Die im Mockup erwähnte
  `noindex`-Kennzeichnung öffentlicher Aushänge ist nicht gebaut (es gibt keine eigene Seite pro Aushang,
  nur die Vorschau auf der Login-Seite) und steht darum nicht im Text.
- **Haupt-DB bekommt Migration 006 nicht automatisch** — nur neue Volumes (db/Dockerfile) und
  Mandanten-DBs (tenant-init). Braucht YourBrand je eins der neuen Module: `006` von Hand einspielen.
- **Nicht gebaut aus den Mockups** — Campus-Sticker auf Profilen, Swipe-Stapel als Entdecken-Startseite,
  Geisterbahnhof-Optik der Hidden Zone, Kiezkasse-Seite. Die Abfahrtstafel (Underground) erscheint nur
  bei offener Hidden Zone, weil Beefs dorthin gehören.
- **Fehlertexte aus dem Backend sind deutsch** — neue Endpoints (Brett, Betreuung) liefern Meldungen
  auf Deutsch, die das Frontend direkt anzeigt. Wie bei den bestehenden Modulen.

## 2026-10-09 — Analytics + Demo-Alter

- **Demo-Daten sind bewusst „geschönt“** — `seed-backdate.ts` verteilt bei jedem Backend-Start Anmeldungen
  über `seedAgeDays`, streckt Chat-Nachrichten über die Laufzeit ihrer Conversation und legt Coins/Uploads
  auf typische Tageszeiten (Spitzen mittags und abends). Für Demos gedacht, nicht für Messungen.
- **Interessen und Städte sind bei allen Mandanten gleich** — gleicher Demo-Seed. Fällt im Vergleich auf.
- **Uploads haben heute eine Spitze** — die kuratierten Medien bekommen beim Seed `NOW()`; die Heatmap
  deckelt die Farbskala deshalb beim 95. Perzentil.
- **Coins zählen nur mit Hidden Zone**, Umsatz/Abos/Premium-Stufe nur mit `payments` — in App und Console.
- **Turbopack übernimmt `globals.css`-Änderungen nicht immer** — nach dem Hinzufügen der Diagramm-Farben
  zeigten die Mandanten-Frontends alte CSS bzw. einen Font-Build-Fehler, bis der Container neu gestartet war.
- **Lint in `dashboard/page.tsx`:** zwei vorbestehende Fehler (`setState` im Effect, `Date.now()` im Render)
  — nicht angefasst.

## 2026-10-07 — Logo in der App (Schritt 8)

- **Mandanten-Stack nach Logo-Wechsel neu starten** — das Backend liest `tenant.json` nur beim Boot, bis
  dahin liefert `/tenant/asset/` das alte Logo bzw. 404. Die Console bietet dafuer nach dem Upload
  „Mandant neu starten“ an (wenn er laeuft).
- **Browser cachen das Logo bis zu 5 Minuten** (`Cache-Control: max-age=300`), Favicons oft laenger —
  nach einem Wechsel ggf. hart neu laden.
- **Lange Markennamen + Logo werden in der Sidebar eng** — mit „KiezConnect“ + Logo (64 px) passt es
  gerade; ein deutlich laengerer Name koennte umbrechen/abgeschnitten werden.
- **Beim Test wurde im Kiez-Mandanten die DSGVO-Zustimmung fuer `owner@demo.example.com` erteilt**
  (wie beim Showcase) — Demo-Daten, aber der Zustimmungs-Screen erscheint dort fuer den Owner nicht mehr.

## 2026-10-07 — Logo-Upload (Schritt 7)

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

- ~~`brand.logo` / `brand.favicon` werden im Frontend nirgends angezeigt.~~ Erledigt in Schritt 8.
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
