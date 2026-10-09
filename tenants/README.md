# Mandanten (Tenants)

Ein Ordner pro Mandant, darin `tenant.json` und optional Logo/Favicon (alle fünf Mandanten haben `logo.svg` und ein daraus erzeugtes `favicon.png`). Das Backend lädt beim Boot
genau einen Mandanten: `TENANT=<slug>` (Default `default`), Ordner aus `TENANT_DIR`
(Docker: `/tenants`, lokal: `../tenants` relativ zu `backend/`). Ungültige Config → Backend
startet nicht und nennt alle Fehler auf einmal.

Neuer Mandant: `_template/` kopieren, Ordner = `slug`, Werte anpassen, dann `scripts/tenant.sh up <slug>`.
Bestehende Mandanten am bequemsten über die [Mandanten-Console](#mandanten-console) ändern.

## Die Showcase-Mandanten

| Mandant | Tier | Module | Look | Navigation | Sprachen |
|---|---|---|---|---|---|
| `default` (YourBrand) | premium | alle | dunkel, Candy (Pink/Lila/Hellblau), Plus Jakarta Sans | Sidebar | alle 9 |
| `kiez` (KiezConnect) | core | chat, payments, **board** | hell, Ziegelrot, Archivo, Aushänge mit Abreißzetteln | Leiste oben | de, en, de_easy |
| `campus-match` (Campus Match) | premium | chat, matching, payments (ohne hidden) | dunkel, Pink/Flieder, Bricolage + DM Sans | Leiste oben | de, en |
| `miteinander` (Miteinander) | connect | chat, **caretaker**, **orgs** (ohne payments) | hell, Blau/Grün, Atkinson Hyperlegible, 18 px, Assistenz | breite Sidebar | de_easy (Standard), de |
| `underground` (Underground) | premium | alle inkl. Hidden Zone | dunkel, Signalgelb, Big Shoulders + Barlow, Abfahrtstafel | Linienplan | de, en, leet |

Die Entwürfe dazu: [`docs/mockups/mandanten-designs.html`](../docs/mockups/mandanten-designs.html).

Farben: `theme.tokens` gilt in beiden Modi, `theme.dark` / `theme.light` nur im jeweiligen Modus
(überschreiben `tokens`). Alle fünf Mandanten setzen einen vollständigen Satz pro Modus, inklusive
Diagrammfarben `--color-viz-1` … `--color-viz-4` (für Farbfehlsichtigkeit geprüft). Nutzer können in
den Einstellungen „Klassische Farben“ wählen, dann gelten die Standardfarben (Mint) aus `globals.css`.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `slug` | ja | `a-z0-9-`, muss dem Ordnernamen entsprechen |
| `brand.name` | ja | Anzeigename |
| `brand.logo` / `brand.favicon` | nein | Dateiname im selben Ordner, keine Pfade. Logo steht im Logo-Button vor dem Namen, Favicon im Browser-Tab (`GET /api/v1/tenant/asset/<datei>`). Am einfachsten per Mandanten-Console (unten) — die erzeugt das Favicon mit |
| `theme.default` | ja | `dark` oder `light` |
| `theme.tokens` | nein | überschreibt Farb-Tokens aus `frontend/app/globals.css`, nur `--color-*` mit Hex-Wert, beide Modi |
| `theme.dark` / `theme.light` | nein | wie `tokens`, aber nur im dunklen bzw. hellen Modus |
| `theme.layout.nav` | nein | `sidebar` (Standard), `topbar` (Leiste oben), `line-map` (Sidebar als Linienplan), `wide-sidebar` (breite Sidebar mit großen Feldern) |
| `theme.layout.font` | nein | `jakarta` (Standard), `bricolage`, `archivo`, `atkinson`, `bigshoulders` — feste Liste, Schriften liegen in `frontend/app/layout.tsx` |
| `theme.layout.radius` | nein | `xs` (4 px) … `lg` (18 px); ohne Angabe: rund am Handy, eckig am Desktop wie bisher |
| `theme.layout.textScale` | nein | 1 bis 1,5, Grundschrift (Miteinander: 1,125 = 18 px) |
| `theme.layout.assist` | nein | Vorlesen, fertige Antworten im Chat, Hilfe-Knopf immer sichtbar |
| `theme.layout.labels` | nein | eigene Menünamen: `{ "dashboard": "Kiez" }` für alle Sprachen oder `{ "board": { "de": "Brett", "en": "Board" } }`. Menüpunkte: `dashboard`, `notifications`, `discover`, `matches`, `chat`, `requests`, `profile`, `settings`, `admin`, `beef`, `board`, `care`, `org`; höchstens 24 Zeichen |
| `locale.default` / `locale.available` | ja | Sprachen aus `frontend/lib/i18n` |
| `tier` | ja | `core`, `connect` oder `premium` — setzt die Modul-Defaults |
| `modules` | nein | überschreibt einzelne Module: `chat`, `matching`, `payments`, `hidden`, `board`, `caretaker`, `orgs`, `shop` |
| `legal` | ja | Impressum-Angaben (`name`, `address`, `email`), für den Shop zusätzlich `vatId` (USt-IdNr., `DE` + 9 Ziffern) oder `taxNumber` |
| `seed` | nein | Demo-Datensatz aus `tenants/<seed>/seed/` (siehe unten), wird nicht öffentlich ausgegeben |
| `seedAgeDays` | nein | Demo: so viele Tage „läuft“ der Mandant schon (siehe unten), wird nicht öffentlich ausgegeben |

Tier-Defaults (`backend/src/common/tenant/tenant.types.ts`):

| Modul | core | connect | premium |
|---|---|---|---|
| chat | ✅ | ✅ | ✅ |
| payments | ✅ | ✅ | ✅ |
| matching | – | – | ✅ |
| hidden | – | – | ✅ |
| board | – | – | – |
| caretaker | – | – | – |
| orgs | – | – | – |
| shop | – | – | – |

`board`, `caretaker`, `orgs` und `shop` sind in keinem Tier Standard, ein Mandant schaltet sie bewusst ein.

Abgeschaltete Module werden im Backend gar nicht geladen (Routen → 404). Ausnahme `chat`: das
Modul bleibt wegen Notifications geladen, Routen und Chat-Events sind aber gesperrt.
Regeln: `matching` und `board` erfordern `chat`, `orgs` erfordert `caretaker`, `shop` erfordert
`payments` und `legal.vatId` oder `legal.taxNumber`.

### Die neuen Module

- **`board` — Schwarzes Brett** (`/board`): Aushänge (Suche, Biete, Verschenke, Treffen) mit
  Sichtbarkeit Straße (150 m) / 500 m / 1 km / Kiez (3 km) / Alle. Umkreis ab dem Ort im Profil.
  „Alle“ ist öffentlich, auch ohne Login (`GET /board/public`, Vorschau auf der Login-Seite), nur
  mit einmaliger Zustimmung (`board_public_consents`) und nie mit Schutz-Markierung
  (`vulnerable_flag`). Aushänge laufen nach 14 Tagen ab. „Zettel abreißen“ schickt eine
  Kontaktanfrage. Die Rechtstexte (AGB § 7, Datenschutz 4.3) erscheinen mit dem Modul auf `/agb` und
  `/datenschutz`, sind aber ungeprüfte Entwürfe.
- **`caretaker` — Betreuung** (`/care`): ein Konto betreut ein oder wenige andere, wie ein
  Eltern-Konto (`managed_accounts`). Die betreute Person stimmt zu und kann Rechte ändern oder die
  Betreuung beenden. Rechte: Nachrichten lesen (nur lesen), Schutz einstellen. Hat die Person
  `vulnerable_flag`, wartet ein angenommener Kontakt auf die Freigabe der Betreuung.
- **`orgs` — Organisation** (`/org`): ein Träger mit Team (`organizations`, `org_members`);
  Betreuungen tragen die `org_id`, die Organisation sieht alle auf einen Blick. Anlegen dürfen
  Plattform-Admin/Owner.
- **`shop` — Shop** (`/shop`, im Aufbau): der Mandant verkauft digitale Artikel (bis ~1000) mit
  Filtern nach Preis, Bewertung, Kategorie. Bezahlung über Stripe Checkout, danach geht automatisch
  eine Rechnung (§ 14 UStG, regelbesteuert) als PDF per Mail raus. Bewerten dürfen nur Käufer.

Schema: `backend/migrations/006_board_and_care.sql` (Mandanten-DBs bekommen es automatisch über
`tenant-init`, die Haupt-DB nur bei neuem Volume). Demo-Daten: `seed-board-care.ts`.

## Isolation

Jeder Mandant bekommt auf der geteilten Infra eigene Namen (`backend/src/common/tenant/tenant-infra.helper.ts`):

| | Name |
|---|---|
| Postgres-Datenbank | `yb_<slug>` (`-` → `_`) |
| MinIO-Bucket | `<slug>-media` |
| Redis-Keys | Prefix `<slug>:` |
| BullMQ-Queues | Prefix `<slug>:bull` |

Explizit gesetztes `DB_NAME` / `S3_BUCKET` gilt **nur** für den Mandanten `default` (bestehender
Haupt-Stack mit seinem Volume). Für alle anderen wird es ignoriert — `backend/.env` ist in jeden
Container gemountet und setzt `DB_NAME`.
Beim Start loggt das Backend: `Mandant "<slug>" — DB …, Bucket …, Redis-Prefix …`.

## Demo-Daten

Ohne `seed` bekommt ein Mandant die mitgelieferten 45 Demo-User
(`backend/src/database/seeds/`). Mit `"seed": "<name>"` kommen sie stattdessen aus
`tenants/<name>/seed/` (eigene `demo-users.yaml` + optional `demo-relations.yaml`, Format wie die
mitgelieferten Dateien) — fuer einen Mandanten mit eigenem, abweichendem Demo-Datensatz.

**Alle vier Showcase-Mandanten setzen bewusst kein `seed`** und teilen sich so denselben
Datensatz wie `default`: einfacher fuer Demos, ein Login funktioniert ueberall. Owner-Login
ueberall gleich: `owner@demo.example.com` / `Demo1234!` (45 kuratierte User insgesamt, siehe
`backend/src/database/seeds/demo-users.yaml`).

Damit die Stats nicht bei allen gleich aussehen, verteilt `seed-backdate.ts` (letzter Schritt in
`backend/docker-entrypoint.sh`) bei jedem Start die Zeitstempel so, als liefe der Mandant schon
`seedAgeDays` Tage: Anmeldungen zwischen Start und heute (gegen Ende dichter), Coins/Abos/Zahlungen/
Media nie vor der Anmeldung des Users. Gerechnet ab dem Boot, der Mandant wirkt also immer gleich alt.
Ohne `seedAgeDays` und im Lasttest (`LOADTEST_MODE`) passiert nichts.

| Mandant | `seedAgeDays` |
|---|---|
| default (YourBrand) | 120 |
| underground | 75 |
| campus-match | 40 |
| miteinander | 14 |
| kiez | 2 |

## Docker

Der Mandant `default` ist der Haupt-Stack (`docker compose up`, Ports 3000/3001). Alle anderen
laufen als eigene Compose-Projekte (`docker-compose.tenant.yml`, Container `yb-<slug>-*`) auf der
geteilten Infra. Am einfachsten startet `scripts/demo.sh up` alles auf einmal (Default + alle
Mandanten + Console). Einzeln:

```bash
scripts/tenant.sh up <slug>|all    # Infra sicherstellen, Mandant(en) bauen + starten
scripts/tenant.sh ls               # Mandanten + URLs
scripts/tenant.sh logs <slug>
scripts/tenant.sh smoke <slug>|all # laufende Mandanten pruefen: /tenant, Owner-Login, Module, Frontend-Titel
scripts/tenant.sh down <slug>|all  # stoppen, Daten bleiben
```

Beim ersten `up` legt das Skript `tenants/<slug>/.env` aus `_template/.env.example` an
(gitignored): Ports (naechstes freies Paar ab 3010/3011), eigene generierte Secrets
(`JWT_SECRET`, `EMAIL_SALT`, `APP_ENCRYPTION_KEY`) und Platzhalter fuer eigene Stripe-/Resend-Keys.
Diese Datei wird im Backend-/Worker-/Init-Container als `/app/.env` gemountet und **ersetzt dort
`backend/.env`** — kein Wert des `default`-Mandanten ist in einem anderen Mandanten sichtbar.
`EMAIL_SALT` und `APP_ENCRYPTION_KEY` nie aendern, sobald Nutzer existieren (E-Mails werden damit
gehasht bzw. verschluesselt).

Der Container `init` (`backend/src/database/tenant-init.ts`) prueft `tenant.json` und die Secrets
(sonst Abbruch, Backend startet nicht), legt DB und
Bucket an und spielt `backend/migrations/*.sql` ein — gemerkt in `tenant_schema_migrations`, also
idempotent und bei neuen Migrationen automatisch nachgezogen. Erst danach starten backend/worker.

Connect entspricht vorerst Core — die Connect-Features (Orgs, Caretaker) sind im Backend noch
nicht gebaut. Öffentlich abrufbar: `GET /api/v1/tenant` (alles außer `seed`).
Plan: [`docs/multitenant.md`](../docs/multitenant.md).

## Mandanten-Console

Lokales Dashboard ueber allen Mandanten auf http://localhost:3099 (nur `127.0.0.1`). Startet mit
`scripts/demo.sh up` automatisch im Hintergrund (PID/Log in `.console/`), von Hand:
`cd backend && npm ci && npm run console`. Laeuft auf dem Host, nicht im Container (braucht git und
docker) und liest die Stats direkt aus `XXX_db`.

- Uebersicht aller Mandanten mit Status, Ports und Stats-Snapshots (Button „Aktualisieren“, Verlauf pro Mandant)
- Editor fuer `tenant.json` mit Validierung (gleiches Schema wie das Backend) und Diff
- Farb-Tokens mit Live-Preview und WCAG-Kontrastpruefung
- Logo-Upload, das Favicon wird daraus erzeugt; danach bietet die Console einen Neustart des Mandanten an
- Analytics pro Mandant (7/30/90 Tage: KPIs, Wachstum, Aktivitaet, Funnel, Heatmap, Abo-Mix, Top-Interessen/-Staedte) und ein Vergleich aller Mandanten nebeneinander

Jede Aenderung wird sofort als `chore(tenant/<slug>): …` committet. Aenderungen an `tenant.json`
greifen erst nach einem Neustart des Mandanten (Config wird beim Boot geladen).
Details: [`docs/console-uebergabe.md`](../docs/console-uebergabe.md), `backend/docs/architecture.md`,
offene Punkte: [`docs/findings.md`](../docs/findings.md).
