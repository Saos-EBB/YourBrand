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

Connect entspricht vorerst Core — die Connect-Features (Orgs, Caretaker) sind im Backend noch
nicht gebaut. Öffentlich abrufbar: `GET /api/v1/tenant` (alles außer `seed`).
Plan: [`docs/multitenant.md`](../docs/multitenant.md).
