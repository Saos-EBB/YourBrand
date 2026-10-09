# Multitenant-Umbau

Stand: 2026-10-06. Alle 8 Schritte umgesetzt.

## Ziel

Eine Codebasis, ein Docker-Image pro App, **3–4 Mandanten** mit eigenem Branding, eigenem
Funktionsumfang (Tier) und eigenen Daten — lokal per `docker compose`. Ein neuer Mandant = eine
Config-Datei + ein Befehl.

## Ist-Zustand (aus dem Code)

| Bereich | Stand |
|---|---|
| Branding | teilweise — `NEXT_PUBLIC_BRAND_NAME` existiert, aber „YourDemo“/„YourBrand“ ~49× hart im Frontend |
| Theme | Farb-Tokens in `frontend/app/globals.css` (dark/light/underground), hart, nicht pro Kunde |
| Tiers Core/Connect/Premium | **nur Marketing** — B2B-Seite verspricht „Module per Lizenzschlüssel aktiviert“, im Code existiert nichts davon, alle Module sind immer an |
| Premium | `PremiumGuard` = Abo des **Users**, nicht Lizenz des **Kunden** |
| Connect-Features | Tabellen `organizations`, `org_members`, `managed_accounts` existieren, kein Backend-Code dazu |
| Daten | 40 Tabellen, keine `tenant_id`, RLS nur auf `profile_sensitive_data` |
| Konfiguration | `system_settings` (Key/Value + Redis-Cache) für Laufzeit, sonst Env-Vars |
| Legal | `LEGAL_INFO` hart in `frontend/config/public.config.ts` |
| Infra | eine DB, ein Redis, ein MinIO-Bucket (`yourbrand-media`), feste `container_name`s (`XXX_*`) |

## Architektur-Entscheidung: Isolationsmodell

| Modell | Aufwand | Isolation | Passt? |
|---|---|---|---|
| A: Shared DB, `tenant_id` + RLS auf allen Tabellen | sehr hoch — jede Query, Raw-SQL, Seeds, Unique-Constraints (Nickname, E-Mail-Hash) | logisch | ❌ zu riskant für den Zweck |
| B: Schema pro Mandant, ein Backend routet | hoch — TypeORM-Repos sind statisch injiziert, bräuchte DataSource pro Request | mittel | ❌ |
| **C: Silo — eigene DB pro Mandant, gleiches Image, Config-getrieben** | mittel | stark (DB, Bucket, Redis getrennt) | ✅ |

**Entscheidung: C (Silo-Multitenancy).**

Begründung:

- DSGVO-Daten (verschlüsselte E-Mails, Strikes, Vulnerable-Flags) sind physisch getrennt.
- Kein Query muss umgebaut werden.
- Passt zur bestehenden Aussage „separate DB pro Kunde“ auf der B2B-Seite.
- Weg zu B/A bleibt offen — die Tenant-Config ist so oder so der Dreh- und Angelpunkt.

Geteilte Infra (Postgres-Server, Redis, MinIO), getrennte Daten:

- **Postgres:** eine Datenbank pro Mandant (`yb_<tenant>`)
- **Redis:** `keyPrefix` pro Mandant (`<tenant>:`) — Settings-Cache, BullMQ, Throttler
- **MinIO:** ein Bucket pro Mandant (`<tenant>-media`)
- **App:** ein `backend` + `worker` + `frontend`-Set pro Mandant, eigene Ports (3010/3011, 3020/3021 …)

## Tenant-Config — eine Quelle der Wahrheit

`tenants/<slug>/tenant.json`, beim Boot gegen ein Schema validiert (ungültig → App startet nicht):

```json
{
  "slug": "kiez",
  "brand": { "name": "KiezConnect", "logo": "logo.svg", "favicon": "favicon.ico" },
  "theme": { "default": "light", "tokens": { "--color-primary-fixed-dim": "#E4572E" } },
  "locale": { "default": "de", "available": ["de", "de_easy", "en"] },
  "tier": "core",
  "modules": { "chat": true, "matching": false, "hidden": false, "payments": true },
  "legal": { "name": "...", "address": "...", "email": "..." },
  "seed": "kiez"
}
```

- **Tier → Module:** `core` / `connect` / `premium` setzen Defaults, `modules` kann einzeln explizit
  überschreiben.
- **Backend:** gesperrte Module werden **nicht registriert** (Routen → 404), Gateways ebenso.
  Zusätzlich ein `FeatureGuard` als zweite Linie. Vorbild existiert schon: `LOADTEST_MODE` in
  `coin.module.ts`.
- **Frontend:** `GET /api/v1/tenant` liefert die öffentliche Config (Branding, Theme, Module).
  Nav und Routen blenden sich danach aus — Durchsetzung passiert aber **immer im Backend**, die UI
  ist nur Komfort.
- **Theme:** Tokens werden zur Laufzeit als CSS-Variablen auf `:root` gesetzt — kein Rebuild pro
  Kunde.

## Die Varianten

| # | Mandant | Zielgruppe | Tier | Look | zeigt |
|---|---|---|---|---|---|
| 1 | **KiezConnect** | Nachbarschaft | Core | light, warm | Auth, Chat, Moderation, DSGVO |
| 2 | **Campus Match** | Studierende | Premium | dark, kräftig | Discover/Matching, PostGIS-Radius, Stripe-Abo |
| 3 | **Miteinander** | Träger/Betreuung | Connect | hoher Kontrast, `de_easy` | Leichte Sprache, Vulnerable-Schutz, Barrierefreiheit |
| 4 | **Underground** | Gaming/Community | Premium + Hidden | `underground-neon` | Beef-Battles, Coins, Hidden Zone, Realtime |

**Entschieden (Variante 3, 2026-10-06):** schlanke Variante — Miteinander zeigt Leichte Sprache,
hohen Kontrast und Vulnerable-Schutz, ohne Orgs/Caretaker (die fehlen im Backend; spaeter eigener
Schritt). Abweichungen von der Tabelle oben: Campus Match ist premium **ohne** Hidden Zone,
Miteinander connect **ohne** Payments.

## Umsetzung in Schritten (je ein Commit)

1. ✅ **Tenant-Config** — Schema, Loader, `tenants/_template/`, `GET /tenant` (2026-10-06, siehe [`tenants/README.md`](../tenants/README.md))
2. ✅ **Feature-Gating Backend** — Tier → Module, bedingte Imports in `app.module.ts`, `FeatureGuard`
   (2026-10-06; Worker braucht kein Gating, er verarbeitet nur Core-Queues)
3. ✅ **Isolation** — DB-Name, Bucket, Redis-/Queue-Prefix aus dem Slug abgeleitet (2026-10-06, `tenant-infra.helper.ts`)
4. ✅ **Frontend Runtime-Config** — Branding/Theme/Legal/Sprache aus `/tenant` (serverseitig im
   Root-Layout), feste Markennamen ersetzt, Nav- und Routen-Gating (2026-10-06)
5. ✅ **Docker** — geteilte Infra in `docker-compose.yml` (Netz `yb_network`), pro Mandant ein
   Compose-Projekt aus `docker-compose.tenant.yml` + `tenants/<slug>/.env`, Init-Container fuer DB,
   Schema und Bucket, `scripts/tenant.sh up|down|ls|logs` (2026-10-06); `scripts/demo.sh up|down|ls`
   startet zusaetzlich den default-Stack (YourBrand) mit und generiert beim ersten Lauf
   `.env`/`backend/.env`/`frontend/.env` (2026-10-06)
6. ✅ **Seeds pro Mandant** — `tenant.json` `"seed"` -> `tenants/<seed>/seed/demo-users.yaml` +
   `demo-relations.yaml`; Datensaetze fuer kiez, campus-match, miteinander, underground (2026-10-06).
   **Update 2026-10-07:** wieder zurueckgebaut — alle vier Showcase-Mandanten nutzen jetzt den
   mitgelieferten Default-Datensatz (kein `"seed"` mehr), damit fuer Demos ueberall dieselben
   Logins gelten. Die eigenen Datensaetze (`tenants/<slug>/seed/`) sind entfernt; `"seed"` bleibt
   als Feature fuer einen Mandanten mit eigenem, abweichendem Datensatz bestehen (siehe
   `tenants/README.md`).
7. ✅ **Die 4 Mandanten anlegen** + Smoke-Test `scripts/tenant.sh smoke` (pro Mandant: `/tenant`,
   Owner-Login, jedes Modul an/aus, Frontend-Titel) (2026-10-06)
8. ✅ **Showcase** — `showcase/` (Playwright): gleicher Ablauf pro Mandant, Screenshots + Video,
   Vergleichsbilder und 2×2-Vergleichsvideo (2026-10-06, siehe [`showcase/README.md`](../showcase/README.md))
9. ✅ **Eigenes Gesicht pro Mandant** (2026-10-09, Entwürfe: [`mockups/mandanten-designs.html`](mockups/mandanten-designs.html)):
   Logo + Favicon für alle fünf, Farben pro Modus (`theme.dark`/`theme.light`), `theme.layout`
   (Navigation, Schrift, Rundung, Textgröße, Assistenz, eigene Menünamen), YourBrand in Candy.
   Neue Module `board` (KiezConnect), `caretaker` + `orgs` (Miteinander) — Migration
   `006_board_and_care.sql`, Details in [`tenants/README.md`](../tenants/README.md).

## Risiken / offene Punkte

- `NEXT_PUBLIC_*` wird bei `next build` eingebacken. Im Dev-Modus egal, für ein Prod-Image muss
  alles Mandanten-Spezifische über `/tenant` laufen.
- RAM: 4× (Backend + Worker + Frontend) im Dev-Modus ≈ 6–8 GB. Optional Compose-Profiles, damit nur
  1–2 Mandanten gleichzeitig laufen.
- `cities` (Referenzdaten, ~7.600 Zeilen) wird pro DB geseedet — ok, kostet nur Bootzeit.
- ~~Stripe/Resend: ein Testaccount für alle~~ — umgesetzt: jeder Mandant hat eine eigene `.env` mit
  eigenen Secrets (`JWT_SECRET`, `EMAIL_SALT`, `APP_ENCRYPTION_KEY`) und eigenen Stripe-/Resend-Keys;
  `backend/.env` ist in Mandanten-Containern nicht sichtbar.
- Offen: Postgres- und MinIO-Zugang sind noch die geteilten Admin-Credentials. Eigene DB-Rolle pro
  Mandant wäre der nächste Isolationsschritt — Achtung: das Backend verbindet heute als Superuser und
  umgeht damit RLS; mit einer normalen Rolle greifen die RLS-Policies erstmals, das braucht einen
  eigenen Test.
- B2B-Seite und README versprechen „Lizenzschlüssel“ — nach Schritt 2 stimmt die Aussage über
  Tier-Config; ein echter signierter Lizenzschlüssel wäre ein eigener Schritt.
