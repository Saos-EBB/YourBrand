# Mandanten (Tenants)

Ein Ordner pro Mandant, darin `tenant.json` (+ später Logo/Favicon). Das Backend lädt beim Boot
genau einen Mandanten: `TENANT=<slug>` (Default `default`), Ordner aus `TENANT_DIR`
(Docker: `/tenants`, lokal: `../tenants` relativ zu `backend/`). Ungültige Config → Backend
startet nicht und nennt alle Fehler auf einmal.

Neuer Mandant: `_template/` kopieren, Ordner = `slug`, Werte anpassen.

## Die Showcase-Mandanten

| Mandant | Tier | Module | Look | Sprachen |
|---|---|---|---|---|
| `default` (YourBrand) | premium | alle | dunkel, Standardfarben | alle 9 |
| `kiez` (KiezConnect) | core | chat, payments | hell, Orange | de, en, de_easy |
| `campus-match` (Campus Match) | premium | chat, matching, payments (ohne hidden) | dunkel, Pink | de, en |
| `miteinander` (Miteinander) | connect | chat (ohne payments) | hell, kräftiges Blau | de_easy (Standard), de |
| `underground` (Underground) | premium | alle inkl. Hidden Zone | dunkel, Cyan | de, en, leet |

Farb-Tokens gelten im hellen und dunklen Modus — deshalb setzen die Mandanten nur Akzentfarben
(Primärfarbe, Text darauf, Glow, Tertiär), keine Hintergründe.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `slug` | ja | `a-z0-9-`, muss dem Ordnernamen entsprechen |
| `brand.name` | ja | Anzeigename |
| `brand.logo` / `brand.favicon` | nein | Dateiname im selben Ordner, keine Pfade. Logo steht im Logo-Button vor dem Namen, Favicon im Browser-Tab (`GET /api/v1/tenant/asset/<datei>`). Am einfachsten per Mandanten-Console (unten) — die erzeugt das Favicon mit |
| `theme.default` | ja | `dark` oder `light` |
| `theme.tokens` | nein | überschreibt Farb-Tokens aus `frontend/app/globals.css`, nur `--color-*` mit Hex-Wert |
| `locale.default` / `locale.available` | ja | Sprachen aus `frontend/lib/i18n` |
| `tier` | ja | `core`, `connect` oder `premium` — setzt die Modul-Defaults |
| `modules` | nein | überschreibt einzelne Module: `chat`, `matching`, `payments`, `hidden` |
| `legal` | ja | Impressum-Angaben (`name`, `address`, `email`) |
| `seed` | nein | Demo-Datensatz aus `tenants/<seed>/seed/` (siehe unten), wird nicht öffentlich ausgegeben |

Tier-Defaults (`backend/src/common/tenant/tenant.types.ts`):

| Modul | core | connect | premium |
|---|---|---|---|
| chat | ✅ | ✅ | ✅ |
| payments | ✅ | ✅ | ✅ |
| matching | – | – | ✅ |
| hidden | – | – | ✅ |

Abgeschaltete Module werden im Backend gar nicht geladen (Routen → 404). Ausnahme `chat`: das
Modul bleibt wegen Notifications geladen, Routen und Chat-Events sind aber gesperrt.
Regel: `matching` erfordert `chat`.

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

## Docker

Der Mandant `default` ist der Haupt-Stack (`docker compose up`, Ports 3000/3001). Alle anderen
laufen als eigene Compose-Projekte (`docker-compose.tenant.yml`) auf der geteilten Infra:

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

Lokales Dashboard ueber allen Mandanten: `cd backend && npm ci && npm run console` → http://localhost:3099
(braucht laufendes `XXX_db` fuer die Stats). Uebersicht + Stats-Snapshots (Button „Aktualisieren“),
Editor fuer `tenant.json` mit Farb-Preview und Logo-Upload; jede Aenderung wird sofort als
`chore(tenant/<slug>): …` committet. Details: `backend/docs/architecture.md`, offene Punkte:
`docs/findings.md`.
