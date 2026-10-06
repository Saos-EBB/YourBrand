# Mandanten (Tenants)

Ein Ordner pro Mandant, darin `tenant.json` (+ später Logo/Favicon). Das Backend lädt beim Boot
genau einen Mandanten: `TENANT=<slug>` (Default `default`), Ordner aus `TENANT_DIR`
(Docker: `/tenants`, lokal: `../tenants` relativ zu `backend/`). Ungültige Config → Backend
startet nicht und nennt alle Fehler auf einmal.

Neuer Mandant: `_template/` kopieren, Ordner = `slug`, Werte anpassen.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `slug` | ja | `a-z0-9-`, muss dem Ordnernamen entsprechen |
| `brand.name` | ja | Anzeigename |
| `brand.logo` / `brand.favicon` | nein | Dateiname im selben Ordner, keine Pfade |
| `theme.default` | ja | `dark` oder `light` |
| `theme.tokens` | nein | überschreibt Farb-Tokens aus `frontend/app/globals.css`, nur `--color-*` mit Hex-Wert |
| `locale.default` / `locale.available` | ja | Sprachen aus `frontend/lib/i18n` |
| `tier` | ja | `core`, `connect` oder `premium` — setzt die Modul-Defaults |
| `modules` | nein | überschreibt einzelne Module: `chat`, `matching`, `payments`, `hidden` |
| `legal` | ja | Impressum-Angaben (`name`, `address`, `email`) |
| `seed` | nein | welcher Demo-Datensatz geseedet wird, wird nicht öffentlich ausgegeben |

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

Explizit gesetztes `DB_NAME` / `S3_BUCKET` gewinnt — nur für den bestehenden `default`-Stack gedacht.
Ein Mandanten-Container darf beides **nicht** setzen, sonst teilt er DB/Bucket mit `default`.
Beim Start loggt das Backend: `Mandant "<slug>" — DB …, Bucket …, Redis-Prefix …`.

Connect entspricht vorerst Core — die Connect-Features (Orgs, Caretaker) sind im Backend noch
nicht gebaut. Öffentlich abrufbar: `GET /api/v1/tenant` (alles außer `seed`).
Plan: [`docs/multitenant.md`](../docs/multitenant.md).
