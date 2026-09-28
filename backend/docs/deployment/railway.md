# Deployment: Backend auf Railway, Frontend auf Vercel

Stand: 2026-08-20. Zielbild ist die oeffentliche Demo — Frontend auf Vercel,
Backend + Postgres auf Railway.

## Warum diese Aufteilung

Vercel kann das Backend nicht hosten. Vier Gruende, alle im Code:

| Blocker | Fundstelle | Warum Serverless nicht geht |
|---|---|---|
| Socket.io-Gateways | `chat.gateway.ts`, `beef.gateway.ts` | Vercel Functions halten keine persistenten WebSocket-Verbindungen |
| Cron jede Minute | `beef.scheduler.ts` | braucht einen dauerhaft laufenden Prozess; Vercel-Cron feuert auf Hobby 1x/Tag |
| Disk-Uploads | `main.ts` (`useStaticAssets`), `media.service.ts` | Serverless-FS ist ephemer, `/uploads` waere nach jedem Call weg |
| PostGIS | `backfill-profile-locations.ts`, Discovery | braucht eine echte Postgres-Instanz mit Extension |

Das Frontend (Next.js 16) laeuft dagegen ohne Anpassung auf Vercel.

## Warum die DB ein eigenes Image braucht

Railways Standard-Postgres bringt **kein PostGIS** mit. `migrations/001_baseline.sql`
legt beim Import `postgis`, `postgis_topology`, `postgis_tiger_geocoder`,
`fuzzystrmatch`, `pgcrypto` und `uuid-ossp` an — davon fehlen im Standard-Image
die PostGIS-Teile, der Import bricht ab.

Deshalb wird der DB-Service aus `backend/db/Dockerfile` gebaut
(`postgis/postgis:16-3.4`), das Image backt `migrations/001_baseline.sql` nach
`/docker-entrypoint-initdb.d/`.

## Dateien fuer den Deploy

| Datei | Zweck |
|---|---|
| `Dockerfile.railway` | Prod-Image: `npm ci` + `npm run build` + `node dist/main` |
| `docker-entrypoint.railway.sh` | wartet auf DB, legt bei Bedarf Schema an, seedet, startet |
| `scripts/deploy/ensure-db.js` | DB-Retry + Schema-Guard (Railway kennt kein `depends_on`) |
| `railway.json` | pinnt Dockerfile, Healthcheck `/api/v1`, Restart-Policy |
| `.dockerignore` | haelt `node_modules/`, `dist/`, `.git`, `uploads/` aus dem Upload |

Das bestehende `Dockerfile` und `docker-entrypoint.sh` bleiben unveraendert —
die sind weiter das Dev-Setup fuer `docker compose up`.

## Schritt 1 — DB-Service

1. Railway-Projekt anlegen, **New Service → GitHub Repo** (dieses Repo).
2. Settings → **Root Directory** = `backend`, **Dockerfile Path** = `db/Dockerfile`.
3. Variables setzen:
   ```
   POSTGRES_DB=yourbrand
   POSTGRES_USER=yourbrand
   POSTGRES_PASSWORD=<langes Zufallspasswort>
   ```
4. **Kein Volume anhaengen.** Fuer die Demo ist das gewollt: ohne Volume ist das
   Datenverzeichnis bei jedem Containerstart leer, Postgres fuehrt dann
   `/docker-entrypoint-initdb.d/000_schema.sql` aus und die DB ist garantiert
   frisch. Mit Volume passiert das genau einmal.

   Wenn doch ein Volume dran soll: Mount-Path `/var/lib/postgresql/data` und
   zusaetzlich `PGDATA=/var/lib/postgresql/data/pgdata` setzen — das Postgres-
   Image bricht sonst ab, weil das gemountete Verzeichnis nicht leer ist
   (`lost+found`). Und: die Uploads liegen im **Backend**-Container, nicht in der
   DB. Ueberlebt die DB einen Redeploy und der Backend-Container nicht, zeigen
   die `media_uploads`-Zeilen auf Dateien, die es nicht mehr gibt — kaputte
   Bilder in der Demo. Fuer die Demo also lieber beide ephemer.

## Schritt 2 — Backend-Service

1. **New Service → GitHub Repo** (dasselbe Repo, zweiter Service).
2. Settings → **Root Directory** = `backend`. `railway.json` wird automatisch
   gefunden und zieht `Dockerfile.railway`.
3. Variables:
   ```
   NODE_ENV=production
   PORT=3000                       # Railway injiziert das selbst, main.ts liest es

   DB_HOST=${{<DB-Service>.RAILWAY_PRIVATE_DOMAIN}}
   DB_PORT=5432
   DB_NAME=${{<DB-Service>.POSTGRES_DB}}
   DB_USER=${{<DB-Service>.POSTGRES_USER}}
   DB_PASSWORD=${{<DB-Service>.POSTGRES_PASSWORD}}

   JWT_SECRET=<langer Zufallsstring>
   EMAIL_SALT=<Zufallssalt>
   APP_ENCRYPTION_KEY=<64 Hex-Zeichen>     # openssl rand -hex 32

   CORS_ORIGIN=https://<projekt>.vercel.app     # Pflicht, sonst crasht der Start
   APP_URL=https://<projekt>.vercel.app
   BACKEND_URL=https://<backend>.up.railway.app

   COOKIE_SAMESITE=none            # Pflicht bei getrennten Domains, siehe unten
   DEMO_MEDIA_PATH=/app            # demoPfp/ und demoAudio/ liegen im Image
   SEED_ON_BOOT=true

   RESEND_API_KEY=<key>            # boot-kritisch, siehe unten
   STRIPE_SECRET_KEY=sk_test_...   # boot-kritisch; fuer die Demo nur Test-Keys
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SUCCESS_URL=https://<projekt>.vercel.app/payment/success
   STRIPE_CANCEL_URL=https://<projekt>.vercel.app/payment/cancel
   ```
   `DB_HOST` ueber `RAILWAY_PRIVATE_DOMAIN` referenzieren, nicht ueber die
   oeffentliche Proxy-Domain: das private Netz braucht kein TLS, und die
   DB-Konfiguration im Code setzt bewusst keine SSL-Optionen.
4. Settings → **Generate Domain**, die entstehende URL in `BACKEND_URL` und in
   die Vercel-Variablen eintragen.

### Boot-kritische Variablen

Drei Variablen legen den Container beim Start lahm, wenn sie fehlen — der
Prozess kommt nicht bis zum ersten Request, Railway sieht nur einen
Crash-Loop:

| Variable | Fundstelle | Fehlermeldung |
|---|---|---|
| `CORS_ORIGIN` | `main.ts` | `CORS_ORIGIN env var is not set` |
| `RESEND_API_KEY` | `mail.service.ts` (Feld-Initializer `new Resend(...)`) | `Missing API key` |
| `STRIPE_SECRET_KEY` | `stripe.service.ts` (Konstruktor) | `STRIPE_SECRET_KEY env var is not set` |

Die beiden letzten scheitern in der DI-Phase, noch bevor Nest routet — ein
Platzhalterwert reicht zum Booten, der jeweilige Feature-Pfad ist damit aber
kaputt. Fuer die Demo heisst das: Stripe-Test-Keys eintragen, und den
Mailversand im Haertungsschritt ersetzen statt mit einem toten Key zu booten.

`EMAIL_SALT`, `APP_ENCRYPTION_KEY` und `STRIPE_WEBHOOK_SECRET` werfen dagegen
erst beim Request — der Container startet, einzelne Endpunkte geben 500.

### Healthcheck

`railway.json` pollt `GET /api/v1`. Diese Route existierte vorher nicht:
`AppController` lag als Nest-Scaffold im Repo, war aber in `app.module.ts` nie
registriert (die Datei hatte gar kein `controllers`-Array). Jetzt verdrahtet
und liefert `{"status":"ok","uptime":<sekunden>}` — bewusst ohne DB-Zugriff,
damit ein kurzer DB-Neustart nicht als kaputtes Deployment gewertet wird und
einen Rollback ausloest. `@SkipThrottle()`, damit die Deploy-Checks nicht gegen
das globale Limit von 100 Requests/60s laufen.

## Schritt 3 — Frontend auf Vercel

1. Neues Vercel-Projekt aus demselben Repo, **Root Directory** = `frontend`.
2. Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app/api/v1
   NEXT_PUBLIC_SOCKET_URL=https://<backend>.up.railway.app
   BACKEND_INTERNAL_URL=https://<backend>.up.railway.app
   ```
3. `frontend/next.config.ts` anpassen — `images.remotePatterns` steht fest auf
   `http://localhost:3000` und muss die Railway-Domain mit `https` erlauben,
   sonst weigert sich `next/image` bei jedem Profilbild.

## Was am Backend fuer den Split-Deploy geaendert wurde

Zwei Dinge, die lokal nie auffallen, weil dort alles auf `localhost` liegt und
damit same-site ist:

- **`main.ts`** — `helmet()` setzt per Default
  `Cross-Origin-Resource-Policy: same-origin`. Auf getrennten Domains blockt der
  Browser damit jedes Bild aus `/uploads`; die Requests sind 200, die `<img>`
  bleiben leer. Jetzt explizit `cross-origin`.
- **`auth.controller.ts`** — das Refresh-Cookie war `SameSite=Lax`. Cross-site
  haengt der Browser ein Lax-Cookie nicht an, `POST /auth/refresh` kommt ohne
  Token an, jede Session stirbt beim ersten Refresh. Jetzt ueber
  `COOKIE_SAMESITE` steuerbar; `none` erzwingt automatisch `Secure`. Die
  `clearCookie`-Aufrufe benutzen dieselben Attribute, sonst nimmt Chrome das
  Loesch-Cookie nicht an und Logout laesst den Token stehen.

Beides ist per Env-Var/Default abwaertskompatibel — lokal aendert sich nichts.

## Was davon verifiziert ist

Lokal gegen das echte Prod-Image getestet (`docker build -f Dockerfile.railway`
plus ein frischer `postgis/postgis:16-3.4`-Container ohne gebackenes Schema):

- Image baut durch, `npm run build` kompiliert sauber.
- **Erster Boot gegen leere DB:** `ensure-db.js` legt das Schema an, alle acht
  Seed-Skripte laufen durch (45 Demo-User, 14054 Staedte, Profile-Backfill).
- **Zweiter Boot gegen befuellte DB:** Schema-Guard no-op, Seeds idempotent
  (`0 angelegt, 45 uebersprungen`).
- `GET /api/v1` → `200 {"status":"ok"}`.
- `POST /api/v1/auth/login` mit `Origin: https://<vercel-domain>` → `200`,
  Antwort traegt `Access-Control-Allow-Credentials: true` und
  `Set-Cookie: ...; HttpOnly; Secure; SameSite=None`.
- `/uploads` antwortet mit `Cross-Origin-Resource-Policy: cross-origin`.

Dabei ist die Uploads-Drift aus Schritt 1 einmal live aufgetreten: DB-Container
blieb stehen, Backend-Container wurde neu gestartet — danach 64 Zeilen in
`media_uploads` und 0 Dateien in `uploads/profiles`. Genau deshalb sollten
beide Services ephemer sein.

Nicht getestet, weil es einen echten Railway-Account braucht: das Aufloesen der
`${{...}}`-Variablenreferenzen und das private IPv6-Netz zwischen den Services.

## Vor dem Oeffentlich-Schalten

Noch offen, bewusst nicht Teil dieses Schritts:

- **Stundenreset** — DB truncaten + `uploads/` leeren + Seeds neu, per
  `@Cron('0 * * * *')` im Backend. Ohne das laeuft die Demo mit fremden Daten
  voll.
- **Demo-Banner** im Frontend (Countdown, Test-Logins, Repo-Link).
- **Demo-Haertung** — Mailversand aus, User auto-verifizieren (sonst kommt ohne
  funktionierendes Resend niemand ueber die Registrierung hinaus),
  `/api/v1/setup` nach dem ersten Seed dicht.
- **`LOADTEST_MODE` muss `false` bleiben** — sonst haengt `POST
  /hidden/coin/test-purchase` oeffentlich am Netz und der Login-Throttle ist aus.
