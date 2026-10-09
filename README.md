# YourBrand — White-Label Community Platform

> A modular, white-label SaaS community platform — full-stack, real-time, GDPR-compliant, and payment-ready.

![Status](https://img.shields.io/badge/status-in_development-orange)
![Backend](https://img.shields.io/badge/backend-NestJS-red)
![Frontend](https://img.shields.io/badge/frontend-Next.js-black)
![Database](https://img.shields.io/badge/database-PostgreSQL_+_PostGIS-blue)

🔗 **[Live Demo (coming soon)](#)** · **[B2B Showcase Page](#)**

---

## About

The final project of my Junior Full-Stack Developer certification — a production-grade, white-label community platform shipped in three modular tiers (Core, Connect, Premium) and re-skinnable per client.

### Motivation

Built to prove that a developer trained primarily in classical software engineering can ship a modern full-stack web platform end-to-end — real-time, payment-ready, GDPR-compliant, and accessible by design.

---

## What's Inside

The platform comes in two configurations sharing the same backbone:

**Light Mode** — the regulated community side
GDPR-compliant infrastructure (AES-256, pseudonymization, Art. 15 export), accessibility by design (WCAG-oriented), real-time chat, Stripe subscriptions, full moderation suite, PostGIS-based discovery, vulnerable user protection.

**Dark Mode** — the engagement & monetization layer
Live public "beef" battle system (15min–48h), coin economy with Stripe coin packages, weighted lottery payouts, hidden zone access (rotating film passwords), highscore leaderboard, exile mechanic with auto-resolution. Hidden Zone also exposes a live CSS theme editor (Colors panel) directly in the sidebar.

### License Tiers

| Tier | Light Mode | Dark Mode |
|---|---|---|
| **Core** | Auth, profile, chat, moderation, Stripe | Beef battles, voting, exile |
| **Connect** | + push, groups, caretakers, orgs | + coin economy, badges, rewards |
| **Premium** | + video chat, matching, ratings | + distribution engine, hidden zone, analytics |

---

## Tech Stack

- **Backend** — NestJS, TypeORM, EventEmitter2
- **Frontend** — Next.js 16, React, Tailwind
- **Database** — PostgreSQL 16 + PostGIS 3.4
- **Real-time** — Socket.io WebSockets
- **Payments** — Stripe (subscriptions + webhooks)
- **Security** — AES-256-CBC, bcrypt, JWT + HttpOnly refresh tokens, SHA-256+salt email hashing
- **Deployment** — Docker Compose (local, self-hosted)

---

## Repository Structure

Monorepo combining frontend and backend in subfolders, with the full commit history of both preserved.

```
.
├── frontend/   # Next.js application
├── backend/    # NestJS API + WebSocket gateway (+ tenant console in src/console/)
├── tenants/    # one tenant.json (+ logo/favicon) per branded tenant
├── scripts/    # demo.sh / tenant.sh
└── docs/       # design notes, findings, handoffs
```

For environment variables and architecture details, see:
- [`frontend/README.md`](./frontend/README.md)
- [`backend/README.md`](./backend/README.md)

---

## Running Locally

### One-command demo (YourBrand + every tenant)

```bash
scripts/demo.sh up    # generates .env/backend/.env/frontend/.env (first run only), then
                       # starts the shared infra + YourBrand (default) + all four tenants
                       # + the tenant console on http://localhost:3099
scripts/demo.sh ls     # every running stack with its URL (default + tenants + console)
scripts/demo.sh down   # stop everything incl. the console, data stays in Postgres/MinIO
```

First run generates `.env`, `backend/.env` and `frontend/.env` with real random secrets
(`JWT_SECRET`, `EMAIL_SALT`, `APP_ENCRYPTION_KEY`, DB/MinIO/pgAdmin credentials) — no manual
editing needed to get a working demo. Stripe/Resend keys stay as inert placeholders (the seeds
never call those APIs). Re-running `up` is idempotent — existing env files and running stacks are
left alone. Internally this is `docker compose up -d --build` (shared infra + the default/YourBrand
stack) followed by `scripts/tenant.sh up all` (the four tenants, see below) — reach for those
directly only if you want one of the two without the other. The console runs on the host, not in a
container, and needs `npm ci` in `backend/` once; without it `up` skips the console with a hint.

### Just YourBrand (default), by hand

```bash
cp .env.example .env               # DB/pgAdmin/JWT values used by docker-compose.yml
cp backend/.env.example backend/.env       # fill in Stripe/Resend/encryption/CORS values
cp frontend/.env.example frontend/.env

docker compose up --build
```

Starts four containers: Postgres+PostGIS (`XXX_db`, port 5432), pgAdmin (port 5050), the NestJS API (`XXX_backend`, port 3000) and the Next.js app (`XXX_frontend`, port 3001) — both app containers run in dev mode with hot-reload via bind mounts, so source changes on the host are picked up immediately.

`.env` (root) and `backend/.env` both define `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`JWT_SECRET` — keep them in sync, the root copy is what `docker-compose.yml` substitutes into the Postgres/pgAdmin/backend service definitions.

The database starts empty. Run the `backend/migrations/*.sql` files in order, starting from `001_baseline.sql` (a consolidated schema snapshot), to get the fully up-to-date schema.

### Multiple tenants, by hand

The same codebase runs as several branded tenants side by side — each with its own database, bucket, Redis namespace, JWT secret and feature set, on the shared Postgres/Redis/MinIO from `docker-compose.yml`:

```bash
scripts/tenant.sh up all     # shared infra + every tenant in tenants/ (except default)
scripts/tenant.sh ls         # tenants with their URLs
scripts/tenant.sh smoke all  # check every running tenant from the outside
scripts/tenant.sh down kiez  # stop one tenant, data stays
```

Tenant configs live in [`tenants/`](./tenants/README.md); the design is in [`docs/multitenant.md`](./docs/multitenant.md).

Every tenant has its own favicon. To make the demo stats look like real usage, each tenant's seed data is spread
over a simulated lifetime (`seedAgeDays` in `tenant.json`): YourBrand has been "live" for about four
months, KiezConnect for two days. Sign-ups, messages, coins and payments get timestamps inside that
window, never before the user signed up.

---

## Tenant Console & Analytics

A small operator console (`backend/src/console/`, http://localhost:3099) manages all tenants in one
place: overview with status, a `tenant.json` editor with validation and auto-commit, color tokens with
live preview and WCAG contrast check, logo upload with generated favicon, and tenant restart.

Both the console and the owner dashboard in the app (`/dashboard`) show analytics read live from
each tenant's database. They cover the last 7, 30 or 90 days:

- KPI tiles with sparklines and the change against the previous period
- Member growth, activity by type, sign-ups and revenue
- A conversion funnel: registered → verified → photo → contact → conversation → premium
- A heatmap by weekday × hour
- The subscription mix, top interests and top cities

Every chart can also be switched to a table. The console overview also compares all tenants side by side.
Details: [`docs/console-uebergabe.md`](./docs/console-uebergabe.md).

---

## Load Testing & Dashboard

A second, fully isolated stack (`docker-compose.loadtest.yml`, own DB/network/port) exists purely to stress-test the API — three modes (login-capacity ramp, mixed endpoint load, single-endpoint rate ramp for isolating a specific bottleneck), driven from a small live web dashboard with no dependencies of its own. Built to answer "how much can this actually take" with real numbers rather than guesses — see [`backend/README.md`'s Load Testing section](backend/README.md#load-testing) for how to run it.

---

## Status

Active development. Core feature set is functional; currently in final integration and QA phase.

---

## Demo Media & License

**This repo is "All rights reserved"** — the code is public to be read (e.g. by recruiters), not to be reused. See [`LICENSE`](LICENSE).

> ⚠️ **Demo data, music, sounds and profile pictures are not mine.** They're only included so the demo feels real — used privately and as part of my job applications, to show *what the platform could be*. They are not covered by the license and must not be reused; all rights stay with their owners. Full list of the files: **[`ASSETS.md`](ASSETS.md)** (film audio and songs in `frontend/public/sounds/`, meme sounds in `frontend/public/ban-audio/` and `frontend/media/`, demo profile audio in `backend/demoAudio/`, demo profile pictures in `backend/demoPfp/`, logos in `frontend/public/images/`).

---

## Attribution

- **GeoNames Geographical Database** von [GeoNames](https://www.geonames.org/) ist lizenziert unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
  - Quelle: https://www.geonames.org/
  - Änderungen: auf Europa erweitert, Spalten angepasst
  - Datei im Projekt: [`backend/src/database/seeds/cities.csv`](backend/src/database/seeds/cities.csv)

---

## About the Developer

Built by **Kevin Schaberl** (SaoS) — Junior Full-Stack Developer.

Background in classical software development, around six months into web full-stack with TypeScript, NestJS, and Next.js.

📫 Contact via the [B2B Showcase Page](#) or GitHub.
