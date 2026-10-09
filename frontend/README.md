# XXX — Frontend

Next.js app (App Router) for the XXX platform. Connects to the XXX NestJS backend at `http://localhost:3000` and takes its branding, theme, languages and feature set from the backend's tenant config.

---

## Contents

- [Tech Stack](#tech-stack)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Key Features](#key-features)
  - [Tenant Awareness](#tenant-awareness)
  - [Analytics](#analytics)
  - [Demo & Offline](#demo--offline)
  - [Auth & Onboarding](#auth--onboarding)
  - [Discover](#discover)
  - [Real-time Chat](#real-time-chat)
  - [Notification Center](#notification-center)
  - [Admin Panel](#admin-panel-admin)
  - [Hidden Zone](#hidden-zone)
  - [Ban Screen](#ban-screen)
  - [Settings](#settings-settings)
  - [Public Profiles](#public-profiles)
  - [i18n](#i18n)
  - [Runtime Configuration](#runtime-configuration-configpublicconfigts)
- [Screens](#screens)
  - [Auth — `(auth)`](#auth--auth)
  - [App — `(app)`](#app--app)
  - [Public — `(public)`](#public--public)
- [Navigation](#navigation)
  - [DesktopSidebar](#desktopsidebar--componentsnav-desktopsidebartsx)
  - [TopNav](#topnav--componentsnav-topnavtsx)
  - [BottomNav](#bottomnav--componentsnav-bottomnavtsx)
- [Auth](#auth)
- [WebSocket](#websocket)
- [Notifications](#notifications)
- [Components](#components)
  - [OnlineIndicator](#onlineindicator--componentsuionlineindicatortsx)
  - [CityAutocomplete](#cityautocomplete--componentsuicityautocompletetsx)
  - [StripeCheckoutModal](#stripecheckoutmodal--componentsuistripecheckoutmodaltsx)
  - [ReportModal](#reportmodal--componentsuireportmodaltsx)
  - [AudioPlayer](#audioplayer--componentsuiaudioplayertsx)
  - [BanModal](#banmodal--componentsuibanmodaltsx)
  - [ContactSupportModal](#contactsupportmodal--componentsuicontactsupportmodaltsx)
  - [BanScreen](#banscreen--componentsuibanscreentsx)
- [Config](#config)
  - [`config/public.config.ts`](#configpublicconfigts)
  - [`useConnectionAction`](#useconnectionaction--hooksuseconnectionactionts)
- [Dev Tools](#dev-tools)
- [Key notes](#key-notes)
- [Known gaps](#known-gaps)
- [Changelog](#changelog)

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 16.2.4 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| State management | Zustand (with `persist` middleware) |
| Real-time | socket.io-client |
| Payments | `@stripe/react-stripe-js` + `@stripe/stripe-js` (Embedded Checkout) |
| Icons | lucide-react |
| Charts | Own SVG components (`components/analytics/charts.tsx`), no chart library |
| Image processing | Sharp (WebP conversion via Next.js image pipeline) |
| Profanity filter | leo-profanity |
| HTTP client | `lib/api.ts` (`fetchApi` wrapper — handles 401 refresh rotation, 204 responses) |

---

## Setup

Via Docker — see [`../docker-compose.yml`](../docker-compose.yml) and the [root README](../README.md#running-locally). This is the recommended path; every tenant gets its own frontend container pointed at its own backend.

Without Docker:

```bash
npm install
npm run dev -- --port 3001
```

App runs on `http://localhost:3001`. The backend must be running on `http://localhost:3000`.

Copy `.env.example` to `.env` and fill in the values.

`next.config.ts` rewrites three paths to `${BACKEND_INTERNAL_URL}` so they always hit the backend of the own tenant: `/uploads/:path*`, `/api/v1/media/file/:path*` (the backend's media proxy) and `/api/v1/tenant/asset/:name` (logo/favicon). `NEXT_PUBLIC_*` vars are baked into the client bundle; `BACKEND_INTERNAL_URL` is server-to-server only, defaulting to `http://localhost:3000` and set per container in docker-compose (`http://nestjs:3000`, or `http://yb-<slug>-backend:3000` for a tenant).

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL (e.g. `http://localhost:3000/api/v1`) |
| `NEXT_PUBLIC_WS_URL` | Backend Socket.io base URL (e.g. `http://localhost:3000`) — was `NEXT_PUBLIC_SOCKET_URL` |
| `BACKEND_INTERNAL_URL` | Server-to-server only (not in the client bundle) — used to fetch `GET /tenant` in the root layout and by the rewrites in `next.config.ts` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for Embedded Checkout |
| `NEXT_PUBLIC_BAN_SCREEN_TEXT` | Text shown on the ban overlay (falls back to `config/public.config.ts` default) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contact address on the offline fallback |
| `NEXT_PUBLIC_DEMO_VIDEO_URL` | Demo video link on the offline fallback |
| `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` | Optional — when set, the offline fallback shows a small form that POSTs there instead of a `mailto` link |
| `NEXT_PUBLIC_CONTACT_*` | WhatsApp, Instagram, email, phone for the B2B contact section |
| `NEXT_PUBLIC_COPYRIGHT_YEAR` | Year shown in the auth layout footer copyright line |

Brand name and legal details (Impressum/Datenschutz/AGB) no longer come from env vars — they come from the tenant (`brand.name`, `legal`).

---

## Key Features

### Tenant Awareness
The same build serves every tenant; everything brand-specific comes from the backend's `GET /tenant`.

- `app/layout.tsx` fetches the tenant on the server (`lib/tenant/server.ts`, falls back to `FALLBACK_TENANT` if the backend is down), so title, `<html lang>`, default theme, color tokens and favicon are right in the first HTML
- `TenantProvider` / `useTenant()` expose the config to client code (`brand`, `theme`, `locale`, `modules`, `legal`)
- Navigation, dashboard, profile actions, settings and background chat fetches follow the enabled `modules`; routes of disabled modules render the 404 page
- Without the `hidden` module the Hidden Zone stays dormant (logo clicks do nothing)
- The language picker only offers the tenant's `locale.available`
- Logo (in the logo button before the name) and favicon load via `/api/v1/tenant/asset/<file>`
- Impressum, Datenschutz and AGB use the tenant's `legal` block

### Analytics
Owner-only section on `/dashboard` (`components/analytics/AnalyticsSection.tsx`), data from `GET /admin/dashboard/analytics?days=7|30|90`:

- KPI tiles with sparklines and the change against the previous period
- Member growth, activity by type, sign-ups and revenue
- Funnel: registered → verified → photo → contact → conversation → premium
- Heatmap by weekday × hour, subscription mix, top interests and cities
- Every chart can be switched to a table; series follow the tenant's modules (no coins without Hidden Zone, no revenue without payments)
- Chart components in `components/analytics/charts.tsx` (own SVG, colors from the theme tokens), texts in all 9 languages

### Demo & Offline
- `DemoBanner` — sticky banner on every page (also when the backend is offline); dismissal is stored in `localStorage`
- `BackendHealthGate` + `useBackendHealth` — polls `<api origin>/health` every 30 s (4 s timeout); when the backend is down, `OfflineFallback` replaces the page: status text, a weekday schedule, a contact action (mailto or form, see env vars) and a demo-video link
- Register page shows a hint under the email field: no real address needed, no mail verification, data is wiped on restart

### Auth & Onboarding
- JWT access token (15 min) in Zustand; refresh token in HttpOnly cookie rotated automatically by `fetchApi` on 401
- `AuthProvider` fetches `/profile/me` on mount, populates user store, establishes global WebSocket, and applies accessibility settings
- Multi-step onboarding wizard required before profile can be published
- Consent flow (`/consent`) after registration
- `/forgot-password` — email form with a generic success message (no account enumeration)
- No server-side route gate: the old `proxy.ts` cookie check was removed (it broke split-domain logins). Protection is client-side — `fetchApi` refreshes on 401 and logs out on failure

### Discover
- 2-col (mobile) / 3-col (desktop) profile grid with skeleton loading
- Filters: `CityAutocomplete` city picker (sends `lat`/`lng`/`radius` to backend), gender, looking_for, age range, online-only; radius slider (10–500 km) enabled once a city is selected
- "Verbinden" sends contact request optimistically; connected profiles show "Chatten →" and "Verbindung trennen"
- "Verbindung trennen" calls `DELETE /chat/connections/:userId` with a bottom-sheet confirmation

### Real-time Chat
- Conversation list with partner online status
- Chat page: WebSocket-powered with optimistic message send (pending spinner → confirmed on echo)
- Typing indicator: animated three-dot bubble, auto-hides after 3 s
- Delete own message: long-press (mobile) or right-click → bottom sheet → `DELETE /chat/messages/:id`
- Scroll-to-bottom button via `IntersectionObserver`
- Block detection: input disabled + banner when either party has blocked the other
- Three-dot header menu: delete chat, report user, block user

### Notification Center
- Real-time delivery via `notification` socket event (no polling required)
- Bell badge with count (max "9+") + pulse ring in `TopNav`
- Dropdown preview in `TopNav` (last 5); full center at `/notifications`
- Tabs: Neu / Verlauf; mark-as-read, delete, "Alle als gelesen markieren"
- Supported types: `message`, `match`, `system`, `ban`, `request`, `beef_request`, `beef_accepted`, `beef_won`, `beef_lost`

### Admin Panel (`/admin`)
Accessible to `role: admin` or `role: owner` users. Auth guard waits for Zustand `persist` hydration before checking role.

| Tab | Description |
|---|---|
| Tickets | Admin ticket queue (moderation + support requests); support tickets show email, optional nickname + public ID |
| Medien | Photo moderation queue — swipe view (approve → / reject ←) or grid; type filter (Alle / Fotos / Audio) |
| Nutzer | Paginated user list with role/ban filters; inline role change; `BanModal` for bans |
| Meldungen | Paginated reports filtered by status; inline status + note editing |
| Strikes | Paginated strikes; "Neuer Strike" modal with debounced nickname search |
| Schimpfwörter | Custom profanity word list; add/delete words |
| Einstellungen | System settings key/value editor — `owner` only |
| Verwaltung | **Owner only.** Admin account list (paginated) + "Admin erstellen" form; "Abonnement-Preise" editor; **Dashboard** accordion with platform stats (lazy-loaded via `GET /admin/dashboard/stats`, refresh button) |

### Hidden Zone

A secret area unlocked by clicking the app logo 13 times within a 3-second window.

**Entry flow:**
1. Click the logo 13 times — letter physics animation fires (`lib/physics/letterPhysics.ts`): letters shake, break off, scatter; `HiddenEntryOverlay` opens after 900 ms
2. "Where Is My Mind" begins playing at the same moment the overlay appears (`lib/hiddenAudio.ts` — singleton, looping, 50 % volume)
3. User types the correct password → particle explosion animation → hidden zone unlocked (`isHidden = true` in `hiddenStore`)
4. Failed attempts increment a tally counter shown as SVG tally marks inside the overlay
5. On logout, `HiddenInitializer` calls `stopHiddenAudio()` and `lock()`, reverting all hidden state

**Theme:** two underground themes toggle via the 🎰/🧱 button that appears in `TopNav` when `isHidden = true` (replaces the former `?` avatar placeholder):
- `underground-brick` — Hinterhof theme (🧱)
- `underground-neon` — Spielhölle theme (🎰)

`HiddenInitializer` (`components/HiddenInitializer.tsx`) adds/removes the corresponding CSS class on `document.documentElement` whenever `isHidden` or `theme` changes.

**Routes:** `app/beef/` (arena list) and `app/beef/[id]/` (live match) — accessible only when `isHidden = true`; linked from nav as "Beef 🥊".

**Game overlay** (`components/beef/`):

| Component | Description |
|---|---|
| `GameOverlay.tsx` | Inline overlay on the beef detail page; 5-s pre-game countdown; routes `game:state_update` / `game:board_update` socket events to the active game component; `phaseRef` prevents duplicate countdown on board updates |
| `WinnerScreen.tsx` | Post-game result screen with 5-s countdown; on close redirects to the player's exile profile page |
| `DevQuickFight.tsx` | Floating dev-only panel (hidden in production) for instant match creation via `POST /hidden/beef/dev/quick-fight` |

**Mini-game components** (`components/beef/games/`):

| Component | Game | Notes |
|---|---|---|
| `TicTacToeGame.tsx` | TicTacToe | Best-of-3; 25 s turn timer with ms display + red progress bar below 5 s; round-result banner (2.5 s) between rounds; timer hidden during `roundOver` |
| `RpsGame.tsx` | Rock / Paper / Scissors / Lizard / Spock | 5-choice grid with emoji; `RpsChoice` includes `'lizard' \| 'spock'` |
| `MastermindGame.tsx` | Mastermind | Opponent `PlayerBoard` shows attempt count + solved badge when `playerState.redacted`; `MAX_GUESSES = 8` |
| `ReactionGame.tsx` | Reaction | Registers `game:go` listener **before** emitting `game:reaction_ready` (prevents missed GO); click sends `game:reaction_click { beefId }` — userId never in payload |

**Key files:**
| File | Role |
|---|---|
| `lib/store/hiddenStore.ts` | Zustand store: `isHidden`, `theme`, `toggleTheme`, `clickCount`, `openOverlay`, `unlock`, `lock`, `passwordAttempts` |
| `lib/hiddenAudio.ts` | Singleton `HTMLAudioElement` (`/sounds/where_is_my_mind.mp3`); `playHiddenAudio()` / `stopHiddenAudio()` |
| `lib/physics/letterPhysics.ts` | Canvas/DOM letter physics: `initLogoLetters`, `startShaking`, `triggerBreak`, `triggerExplosion`, `spawnTextLetters`, `cleanup` |
| `components/HiddenEntryOverlay.tsx` | Password dialog with tally marks; physics explosion on correct password |
| `components/HiddenInitializer.tsx` | Applies underground theme classes; stops audio on logout |
| `public/sounds/where_is_my_mind.mp3` | Hidden zone unlock audio |

---

### Ban Screen
- `BanScreen` component: full-screen overlay (`z-[9999]`) shown when `isBanned` is `true` in auth store
- Ban state derived from `/profile/me` on startup and from `user.banned` / `user.unbanned` socket events
- `isBanned` is in-memory only — never persisted to `localStorage`
- Plays a random audio clip from `public/ban-audio/` (looped); text sourced from `PUBLIC_CONFIG.banScreen.text`
- "Abmelden" clears auth store and redirects to `/login`

### Settings (`/settings`)
Accordion layout — one section open at a time with CSS `grid-rows` height transition.

| Section | Contents |
|---|---|
| Design & Barrierefreiheit | Theme toggle, profanity filter, font size, high contrast, simple language, UI language selector |
| Benachrichtigungen | Email + push notification toggles |
| Sichtbarkeit | `is_published` master toggle + 7 field visibility toggles (`status_visible`, `show_bio`, `show_city`, `show_age`, `show_gender`, `show_interests`, `show_audio`) |
| Konto | Subscription info, GDPR data export (PDF download), **Passwort ändern** (fully functional — `PATCH /auth/change-password`), **E-Mail ändern** (fully functional — `PATCH /auth/change-email`), account delete |
| Sicherheit & Blockierungen | Blocked user list with inline unblock |
| Abonnement & Zahlung | Subscription detail, Stripe Embedded Checkout, cancel flow |
| Support | Report modal (nickname-lookup mode) |

### Public Profiles
- `/profile/[nickname]` — public view; fields masked by backend `show_*` flags
- Online status, status message, interests, audio player
- Connect/disconnect, block, and report actions

### i18n
- 9 languages in `lib/i18n/`: `de`, `de_easy` (Leichte Sprache), `en`, `es`, `fr`, `it`, `ja`, `ru`, `leet` — typed against `types.ts`
- The language picker in Settings offers only the languages the tenant allows; the tenant's `locale.default` is the starting language

### Runtime Configuration (`config/public.config.ts`)
- `PUBLIC_CONFIG` exported object for settings that need to be configurable without a rebuild
- Currently: `banScreen.text` and `banScreen.audioFiles`
- Falls back to `NEXT_PUBLIC_*` env vars or hardcoded defaults

---

## Screens

### Auth — `(auth)`

The auth layout (`app/(auth)/layout.tsx`) wraps all auth routes with a sticky footer showing the copyright year (`NEXT_PUBLIC_COPYRIGHT_YEAR`), the tenant's brand name, and Impressum / Datenschutz / AGB links.

| Route | Description |
|---|---|
| `/forgot-password` | Request a password reset email. Always shows the same success message. |
| `/login` | Email or nickname + password login. Stores JWT access token in Zustand. Shows a success banner when redirected from `/setup?setup=done`. "Support kontaktieren" button opens `ContactSupportModal`. |
| `/register` | Registration form. Sends verification email via backend. |
| `/setup` | One-time owner bootstrap wizard. Checks `GET /setup/status` on load; redirects to `/login` if setup is already complete. Form creates the first owner account via `POST /setup`. |
| `/verify` | Email verification landing page (reads `?token=` from URL). |
| `/consent` | AGB / privacy consent flow after registration. |

### App — `(app)`

All app routes are protected. Unauthenticated users are redirected to `/login`.

#### `/dashboard`
Home screen after login. Shows role badge (Crown/Shield) in the welcome heading for owner/admin users, then stat sections (cards for disabled modules are hidden):
- **Mein Überblick** (all users): pending contact requests, active conversation count, subscription status — via `GET /admin/dashboard/user-stats`
- **Moderations-Überblick** (admin + owner): open reports, open tickets, pending media, strikes this week — via `GET /admin/dashboard/admin-stats`
- **Plattform-Übersicht** (owner only): full platform metrics grid (users, activity, revenue, moderation) — via `GET /admin/dashboard/stats`
- **Analytics** (owner only): charts, funnel and heatmap — see [Analytics](#analytics)

Followed by quick-access cards (Discover, Chat, Requests) and recent notifications.

#### `/discover`
Browse published profiles in a 2-col (mobile) / 3-col (desktop) grid. Skeleton loading state on initial fetch.

Filters: city (text, Enter to apply), gender, looking_for, age range (min/max), online-only toggle. Apply and reset buttons.

Each profile card shows photo, name + age, city, up to 3 interest chips, and an `OnlineIndicator` for status. "Verbinden" button posts to `POST /chat/requests`; the card switches to "Anfrage gesendet ✓" optimistically. Nickname links to `/profile/[nickname]`. Connected profiles show "Chatten →" and a "Verbindung trennen" button; the latter opens a bottom sheet confirmation and calls `DELETE /chat/connections/:userId` (deletes chat for both sides).

#### `/matches` (nav label: "Matching")
Two-tab Matching hub.

**Swipen tab** — swipe deck powered by `GET /discover/deck`. Each card shows profile photo, name + age + city, interest chips (green/red flag styling), and a compatibility score bar. Like (Heart) / Skip (X) buttons call `POST /discover/swipe`. On mutual like a match-flash banner appears at the top of the page with a button to jump straight to the Matches tab; the next card advances automatically after 2 s.

**Matches tab** — grid of mutual matches from `GET /discover/matches`. Each card shows approved photo, nickname, age, city, and a "Chat öffnen" button (links to `GET /chat/conversations/:id`). Skeleton loading state on fetch; empty state with prompt to go swipe; error state.

#### `/requests`
Incoming and outgoing contact requests. Accept / decline.

#### `/chat`
Conversation list. Partner online status shown via ring dot and `OnlineIndicator` label.

#### `/chat/[id]`
Real-time conversation page.

- Messages loaded from `GET /chat/conversations/:id/messages`.
- Partner nickname resolved via `GET /profile/user/:pid`; partner online status fetched from `GET /profile/:nickname`.
- WebSocket: emits `join_conversation`, `send_message`, `typing` (throttled to once per 2 s), `read_messages`; listens for `new_message` and `user_typing`.
- Optimistic send: message appears immediately with a pending spinner; replaced by confirmed message on `new_message` echo.
- Typing indicator: animated three-dot bubble, auto-hides after 3 s of silence.
- Delete own message: long-press (mobile) or right-click → bottom sheet confirmation → `DELETE /chat/messages/:id`. Deleted messages render as "Nachricht gelöscht".
- Scroll-to-bottom button appears when the sentinel div leaves the viewport (IntersectionObserver).
- Suppresses the bell unread badge for `message`-type notifications while this conversation is open.
- **Three-dot menu** (header): "Chat löschen" (DELETE own copy, navigates to `/chat`), "User melden" (opens `ReportModal`), "Nutzer blockieren" (bottom sheet → `POST /profile/me/block/:userId`).
- **Block banner:** when `is_blocked = true` (either direction) the input is disabled and a banner shows "Dieser Nutzer hat dich blockiert." or "Du kannst diesem Nutzer keine Nachrichten senden." Partner name replaced with "XXXX" when blocked.

**Not yet implemented:** `read_at` data exists in the message type but read receipts are not rendered in the UI.

#### `/notifications`
Full notification center.

- Loads from `GET /notifications`, hydrates `notificationStore`.
- Neu / Verlauf tabs split by `is_read`.
- Per-notification: click marks as read (`PATCH /notifications/:id/read`), trash icon deletes (`DELETE /notifications/:id`).
- "Alle als gelesen markieren" button in the Neu tab (`PATCH /notifications/read-all`).
- "Alle löschen" button in the Verlauf tab.
- Relative timestamps (gerade eben / vor N Min. / Std. / Tagen).
- Supports types: `message`, `match`, `system`, `ban`, `request` — each with its own icon and label.

#### `/profile`
View and edit own profile.

**View mode:** full-square photo (or initial-letter fallback), nickname + age overlay, city + `OnlineIndicator` overlay, bio, interest chips.

**Edit mode** (activated by "Bearbeiten" button):
- Photo: tap/click the overlay → hidden file input → client-side validation (JPEG/PNG/WebP, max 5 MB) → `POST /media/upload/profile-photo`; preview shown immediately from object URL.
- Nickname, city (inline inputs on photo), bio (textarea, 1000 char limit with counter), gender + looking_for (selects), `is_published` toggle.
- If nickname or gender is changed from the original loaded value, a warning banner appears inline ("einmal pro Jahr") before saving. Reverts to no-warning if the original value is restored. On save, a 400 from the backend with "einmal pro Jahr" surfaces as a user-friendly toast instead of the raw error.
- Interests: full list of available interests shown as toggleable chips; `POST`/`DELETE /profile/me/interests/:id` per toggle.
- Save writes `PUT /profile/me`, then re-fetches to confirm.

Audio voice message: `AudioPlayer` component renders the uploaded clip with play/pause, seek bar, and elapsed/total timestamp. Delete button shown only in edit mode.

#### `/settings`

Accordion layout — single section open at a time, CSS `grid-rows` height transition.

**A) Design & Barrierefreiheit:**
- Theme toggle (dark/light) via `useThemeStore`.
- Schimpfwortfilter toggle — auto-saves `profanity_filter` to `PUT /profile/me`.
- Font size selector (Normal / Groß / Sehr groß) — auto-saves to `PUT /profile/me`.
- High contrast and simple language toggles — auto-save to `PUT /profile/me`.
- UI language selector (Deutsch / English) — UI only, not persisted.
- Live accessibility preview box.

**B) Benachrichtigungen:**
- Email and push notification toggles (messages, matches, system) — auto-save to `PUT /notifications/settings`.

**C) Sichtbarkeit:**
- Master `is_published` toggle ("Profil öffentlich") — auto-saves to `PUT /profile/me`; disabled if onboarding not complete. Helper text: "Nickname und Profilbild sind immer sichtbar".
- 7 individual field toggles (auto-save via `PUT /profile/me`, dimmed/disabled when `is_published = false`): Online-Status (`status_visible`), Bio (`show_bio`), Stadt (`show_city`), Alter (`show_age`), Geschlecht & Suche (`show_gender`), Interessen (`show_interests`), Vorstellung / Audio (`show_audio`). Values are preserved while dimmed — not reset.

**D) Konto:**
- Subscription info sourced from `GET /profile/me` (`subscription` field) — shows plan badge, status label, and expiry date; displays "Kein aktives Abonnement" when `null`.
- **Daten exportieren (PDF)** — calls `GET /gdpr/export` and still expects a PDF blob (`paarship-daten-export.pdf`); the backend now mails the PDF and returns JSON instead, see [Known gaps](#known-gaps). Rate-limit (403) shows cooldown message in amber; other errors show red message. DSGVO hint ("max. 1× pro 30 Tage") shown below the button. Spinner while loading.
- **Passwort ändern** (nested sub-accordion within Konto) — current password + new password + confirmation; show/hide toggles; calls `PATCH /auth/change-password`; success state clears fields.
- **E-Mail ändern** (nested sub-accordion within Konto) — current password + new email address; calls `PATCH /auth/change-email`; success state clears fields.
- **Konto löschen** — focus-trapped confirmation dialog; calls `DELETE /auth/account`, clears auth store and redirects to `/login` on success; shows inline error on failure with spinner during the request.
- Logout button — `POST /auth/logout` + clears Zustand store; succeeds even if the backend is unreachable.

**E) Sicherheit & Blockierungen:**
- Blocked user list lazy-loaded from `GET /profile/me/blocks` when the section is first opened. Shows avatar, nickname, and an "Entsperren" button.
- Unblock flow: tap "Entsperren" → inline confirmation ("Bestätigen" / "Abbrechen") → `DELETE /profile/me/block/:userId`; user removed from list on success with success toast.

**F) Abonnement & Zahlung:**
- Subscription detail fetched lazily from `GET /payment/subscriptions` when the accordion is first opened — not on page mount.
- **Active subscription:** plan label (Monatlich / Jährlich / Lebenslang), "Aktiv" badge, expiry date in de-DE format (hidden for lifetime plan). Cancel button ("Abonnement kündigen") reveals an inline confirmation step ("Bist du sicher? Diese Aktion kann nicht rückgängig gemacht werden." + Bestätigen / Abbrechen) before calling `DELETE /payment/subscriptions/:id`; on success profile is re-fetched.
- **No active subscription:** "Kein aktives Abonnement" message and three plan buttons (Monatlich / Jährlich / Lebenslang) with prices fetched from `GET /system-settings/prices` shown inline (e.g. "Monatlich — €9.99"). Clicking any plan opens `StripeCheckoutModal` with the selected plan.
- **Hidden for admin/owner users:** the entire Abonnement & Zahlung section is not rendered when the user's role is `admin` or `owner`.

**G) Support:**
- "Problem melden" button opens `ReportModal` without a pre-filled user (nickname lookup mode).

All saves show a toast (✓ success or ✗ error).

#### `/onboarding`
Profile setup wizard — required before the profile can be published or the app fully accessed.

#### `/admin`
Admin panel — accessible to `role: admin` or `role: owner` users. Auth guard waits for Zustand `persist` hydration before evaluating the JWT role to prevent false redirects on first render.

Eight tabs (`owner` sees all; `admin` does not see **Verwaltung**):

| Tab | Description |
|---|---|
| Tickets | Admin ticket queue. Two sub-lists: moderation tickets (nickname / image / audio) and support requests. Support requests show submitter email, optional nickname and public ID, message body, and timestamp. |
| Medien | Photo/audio moderation. **Swipe view**: full-screen one-card-at-a-time workflow — approve with → key / right-arrow button, reject with ← key / left-arrow button; audio cards show filename + Play/Pause (Spacebar); type filter (Alle / Fotos / Audio); counter ("3 von 12"); tilt animation. Photos proxied via Next.js (`/uploads/…`) to avoid CORS. |
| Nutzer | Paginated user list with role/banned filters and nickname search. Inline role selector; ban/unban actions via `BanModal`. |
| Meldungen | Paginated report list filtered by status. Inline status + note editing per report. |
| Strikes | Paginated strike list. "Neuer Strike" modal — type (`warning`, `temp`, `permanent`), **nickname search** (debounced lookup, select from results), reason, optional expiry. |
| Schimpfwörter | Custom profanity word list. Add / delete words; persisted to `profanity_words` table via backend. |
| Einstellungen | System settings key/value editor. **Owner only.** |
| Verwaltung | **Owner only.** Four accordion sub-sections: (A) "Dashboard" — platform stats grid (users, activity, revenue, moderation) lazy-loaded via `GET /admin/dashboard/stats` with a refresh button and skeleton loading; (B) admin account list (paginated, `GET /admin/admins`) — shows nickname, role badge, verified status, last login; (C) "Admin erstellen" form (`POST /admin/users/create`) — email, password, nickname; (D) "Abonnement-Preise" — edit monthly/yearly/lifetime prices via `PATCH /system-settings/prices`, confirmation modal before saving; note to keep prices in sync with Stripe. |

### Public — `(public)`

| Route | Description |
|---|---|
| `/profile/[nickname]` | Public profile page. Visibility flags respected. Connect, block, and report actions. |
| `/impressum` | Impressum (§ 5 TMG/ECG). Operator details from the tenant's `legal` block. |
| `/datenschutz` | Datenschutzerklärung, checked against the backend code (encryption, RLS scope, storage duration, demo reset, Stripe test mode, data-subject rights). |
| `/agb` | AGB with real content. |

All three show `LegalPageNotice` (demo note + "not legal advice").
| `/b2b` | B2B landing page. Contact section from `NEXT_PUBLIC_CONTACT_*` env vars. |

### Beef — `beef/` (Hidden Zone)

Accessible only when `isHidden = true`. Route group sits outside `(app)` — not in the standard App Router layout.

| Route | Description |
|---|---|
| `/beef` | Arena list page. Four tabs: **Anfragen** (incoming challenges with Fight / Chicken buttons), **Meine Beefs** (active + game-phase), **Public** (spectator view with `🎮 Live!` badge for game-phase), **Highscore** (top 20 leaderboard). All three lists fetched in parallel. |
| `/beef/[id]` | Live beef detail. Shows participant names, chat passage blockquote, coin vote bar with wager presets (1/5/10/50/100), comment section, winner screen. Mounts `GameOverlay` when beef is in `game_pending`/`in_game` state. |

---

## Navigation

### `DesktopSidebar` — `components/nav/DesktopSidebar.tsx`
Sticky left sidebar, desktop only (`hidden md:flex`). Layout top→bottom:

1. **Logo row** — `HiddenLogoButton` (6-click Easter egg).
2. **Status + Coins row** — `StatusPicker` (online status dropdown) + `HiddenZoneControls` (coin balance + shop, Hidden Zone only).
3. **Main nav** — Home, Notifications, Discover, Matching, Chat, Requests/Admin, Beef (Hidden Zone). Each tab shows a coloured badge count for its unread notification types; the badge colour is `--color-nav-badge-glow` (theme-configurable).
4. **Colors accordion** — `ColorPalettePanel` collapsible section, Hidden Zone only. Live CSS-variable editor directly in the sidebar.
5. **Settings + Profile** links.
6. **AdminBadge** — admin/owner only.

Notification routing per tab: Chat ← `message`; Notifications ← `match / system / ban / beef_*`; Requests ← `request`. Beef tab never badges (all beef notifications go to the Notifications tab).

### `TopNav` — `components/nav/TopNav.tsx`
Sticky header, **mobile only** (`md:hidden`).

- Logo → `/dashboard`.
- **Status indicator:** `StatusPicker` reflecting `status_visible` + `status_message` from `/profile/me`. Clicking opens a dropdown to set one of five statuses or toggle "Unsichtbar"; saves to `PUT /profile/me` optimistically.
- **Bell icon (`NotificationBell`):** unread badge (count, max "9+") + pulse ring using `--color-nav-badge-glow`. Dropdown shows last 5 notifications in Neu/Verlauf tabs; per-notification click navigates and marks read; trash deletes; "Alle als gelesen" button. Links to `/notifications` for the full view.
- Polls `GET /notifications` and `GET /chat/requests/incoming` on mount; injects a `_local` notification for newly seen pending requests.
- Settings + Profile icon links.

### `BottomNav` — `components/nav/BottomNav.tsx`
Fixed bottom bar, mobile only (`md:hidden`). Five items: Home, Discover, Matching, Chat, Profile. Active item gets a filled icon in the primary color.

---

## Auth

- JWT access token (15 min) stored in Zustand + persisted to `localStorage` via `persist` middleware.
- Refresh token stored as httpOnly cookie; rotated automatically by `fetchApi` on 401.
- `AuthProvider` (`components/AuthProvider.tsx`) fetches `/profile/me` on mount, populates the user store, applies accessibility settings, and establishes the global WebSocket connection. If the response includes `is_banned: true`, `setBanned(true)` is called immediately and the ban screen is shown.
- `isBanned` in `authStore` is **in-memory only** — not persisted to `localStorage`. Ban state is always derived from the backend on startup (via `/profile/me`) or in real-time (via `user.banned` / `user.unbanned` socket events). This prevents stale ban state surviving across sessions.
- Ban screen (`components/ui/BanScreen.tsx`): full-screen overlay shown when `isBanned` is true. Plays a random audio clip from `public/ban-audio/`. Shows a logout button that calls `POST /auth/logout`, clears auth store, and redirects to `/login`.

---

## WebSocket

The socket is established globally in `AuthProvider` once the user profile loads. This means real-time notifications work on every page, not just the chat page.

**Module:** `lib/socket.ts` — singleton Socket.io client.

```ts
connect(token)  // creates socket with auth token; no-op if already connected
disconnect()    // tears down the socket
getSocket()     // returns the current Socket | null
reconnect(token) // force-reconnects with a new token
```

**Global listeners** (`AuthProvider`):
- `new_message` → fires a bell notification for any incoming message across all conversations.
- `notification` → hydrates `notificationStore` with the incoming notification in real time (no polling needed).
- `contact_request` → fires a bell notification for new incoming contact requests.
- `user.banned` → calls `clearAuth()` + `setBanned(true)`; shows the ban screen overlay.
- `user.unbanned` → calls `setBanned(false)`; hides the ban screen overlay.

**Chat page listeners** (`app/(app)/chat/[id]/page.tsx`):

| Emitted | Received |
|---|---|
| `join_conversation` | `new_message` |
| `send_message` | `user_typing` |
| `typing` | |
| `read_messages` | |

Cleanup uses named handler references (`sock.off('event', handler)`) so the chat page never removes the global AuthProvider listener on unmount.

---

## Notifications

- **Store:** `lib/store/notificationStore.ts` (Zustand)
- **Sources:**
  - Backend `/notifications` polled every 30 s
  - Real-time `new_message` socket events (via global AuthProvider listener)
  - New pending contact requests polled every 30 s in `TopNav`
- **`_local` flag:** client-generated notifications are marked `_local: true` and skip the `PATCH /notifications/:id/read` call — they have no backend record.
- **Bell badge:** glows and pulses when `unreadCount > 0`.

---

## Components

### `OnlineIndicator` — `components/ui/OnlineIndicator.tsx`

Reusable online-status dot + optional status label.

```tsx
<OnlineIndicator is_online={true} status_message="available" size="sm" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `is_online` | `boolean` | — | Green dot when true, gray when false |
| `status_message` | `string \| null` | `null` | Translated label shown next to dot |
| `size` | `'sm' \| 'md'` | `'sm'` | Dot size (`h-2 w-2` vs `h-3 w-3`) |

Status translations: `available` → Verfügbar · `looking_for_chat` → Suche Gespräch · `looking_for_date` → Suche Date · `busy` → Beschäftigt · `do_not_disturb` → Nicht stören.

Renders an accessible `aria-label` describing the combined state.

### `CityAutocomplete` — `components/ui/CityAutocomplete.tsx`

City autocomplete input. Queries `GET /cities/search?q=` as the user types and renders a dropdown of results.

```tsx
<CityAutocomplete
  value={city}
  onSelect={(city) => { setCity(city.name); setCoords({ lat: city.lat, lng: city.lng }) }}
  onClear={() => { setCity(''); setCoords(null) }}
  placeholder="Stadt"
  ariaLabel="Nach Stadt filtern"
  inputClassName="..."
/>
```

| Prop | Type | Description |
|---|---|---|
| `value` | `string` | Controlled display value |
| `onSelect` | `(city: { id, name, country, region, lat, lng }) => void` | Called when the user picks a result |
| `onClear` | `() => void` | Optional — called when the input is cleared |
| `placeholder` | `string` | Input placeholder |
| `ariaLabel` | `string` | `aria-label` on the underlying input |
| `inputClassName` | `string` | CSS classes forwarded to the `<input>` |

---

### `StripeCheckoutModal` — `components/ui/StripeCheckoutModal.tsx`

Modal wrapper for Stripe Embedded Checkout.

```tsx
<StripeCheckoutModal plan="monthly" onClose={() => setCheckoutPlan(null)} />
```

| Prop | Type | Description |
|---|---|---|
| `plan` | `'monthly' \| 'yearly' \| 'lifetime'` | Plan to purchase |
| `onClose` | `() => void` | Called when the backdrop or × button is clicked |

On mount POSTs to `POST /payment/subscriptions` to obtain a `clientSecret`, then renders `EmbeddedCheckoutProvider` + `EmbeddedCheckout` from `@stripe/react-stripe-js`. After payment Stripe redirects to `STRIPE_RETURN_URL` automatically. Requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local`.

---

### `ReportModal` — `components/ui/ReportModal.tsx`

Modal for reporting a user or piece of content.

```tsx
<ReportModal reportedUserId="uuid" onClose={() => setOpen(false)} />
```

| Prop | Type | Description |
|---|---|---|
| `reportedUserId` | `string \| undefined` | Pre-fills the target user. If omitted, a nickname text input is shown and the user ID is resolved via `GET /profile/:nickname`. |
| `messageId` | `string \| undefined` | Optional — attached to the report body when reporting a specific message. |
| `onClose` | `() => void` | Called when the backdrop or × button is clicked, or automatically after 2 s on success. |

Five preset reason options (Belästigung, Spam, Fake-Profil, Unangemessene Inhalte, Missbrauch) + optional free-text description (500 char limit). Submits to `POST /moderation/reports`. Used from the chat header, the public profile page, and the Support settings accordion.

---

### `AudioPlayer` — `components/ui/AudioPlayer.tsx`

Custom audio player replacing native `<audio controls>` on profile pages.

```tsx
<AudioPlayer src="/uploads/audio/intro.webm" />
```

| Prop | Type | Description |
|---|---|---|
| `src` | `string` | Audio file URL |

- Play/Pause toggle with `lucide-react` icons.
- Clickable seek bar (`onClick` on the track div).
- `MM:SS / MM:SS` elapsed/total timestamp.
- Progress driven by `requestAnimationFrame` loop — smooth animation at display refresh rate.
- Resets state (`isPlaying`, `currentTime`, `duration`) when `src` changes.
- Colors: `text-primary-fixed-dim` / `bg-primary-fixed-dim` (Tailwind v4 tokens).

### `BanModal` — `components/ui/BanModal.tsx`

Admin modal for banning a user. Used from the `/admin` Nutzer tab.

```tsx
<BanModal userId="uuid" nickname="alice" reportId="uuid" onSuccess={() => loadUsers()} onClose={() => setBanModal(null)} />
```

| Prop | Type | Description |
|---|---|---|
| `userId` | `string` | Target user UUID |
| `nickname` | `string` | Displayed in the modal title |
| `reportId` | `string \| undefined` | Optional report UUID attached to the ban |
| `onSuccess` | `() => void` | Called after a successful ban (before closing) |
| `onClose` | `() => void` | Called when backdrop or × is clicked |

Duration dropdown (24h / 7d / 30d / permanent), reason dropdown (5 presets), optional free-text note (appended to reason, 500 char limit). Posts `PATCH /admin/users/:id/ban` with `{ duration, reason, report_id? }`.

---

### `ContactSupportModal` — `components/ui/ContactSupportModal.tsx`

Anonymous support contact form. Shown on the login page.

```tsx
<ContactSupportModal onClose={() => setShowSupportModal(false)} />
```

| Prop | Type | Description |
|---|---|---|
| `onClose` | `() => void` | Called when backdrop or × is clicked (disabled while loading) |

Fields: email (required), nickname (optional), public ID (optional), message (required, 10–1000 chars). Submits to `POST /support/contact`. Rate-limited to 3 requests/hour by backend. Shows a success confirmation state after submission.

---

### `BanScreen` — `components/ui/BanScreen.tsx`

Full-screen overlay rendered by `AuthProvider` when `isBanned` is `true` in the auth store.

- Plays a random audio clip from `public/ban-audio/` on mount (looped).
- Displays configurable ban text (rubber-stamp styling, 10° rotation). Text sourced from `PUBLIC_CONFIG.banScreen.text` → falls back to `NEXT_PUBLIC_BAN_SCREEN_TEXT` env var or `'Dein Account wurde gesperrt.'`.
- "Abmelden" button: calls `POST /auth/logout`, clears auth store, redirects to `/login`.
- `z-[9999]` — covers all other content.
- Audio file list managed in `config/public.config.ts`.

---

## Config

### `config/public.config.ts`

Static runtime config exported as `PUBLIC_CONFIG`. Currently holds ban screen settings:

```ts
PUBLIC_CONFIG.banScreen.text        // ban overlay message
PUBLIC_CONFIG.banScreen.audioFiles  // array of filenames from public/ban-audio/
```

Text falls back to `process.env.NEXT_PUBLIC_BAN_SCREEN_TEXT` or the default string. Audio files are served statically from `public/ban-audio/`.

---

### `useConnectionAction` — `hooks/useConnectionAction.ts`

Custom hook that manages all connection state mutations for a target user.

```ts
const conn = useConnectionAction(targetUserId, initialStatus, initialRequestId, initialConversationId)
```

| Return value | Type | Description |
|---|---|---|
| `connectionStatus` | `ConnectionStatus` | Live status: `NONE \| SENT \| RECEIVED \| CONNECTED \| BLOCKED` |
| `conversationId` | `string \| null` | Conversation ID once connected |
| `isLoading` | `boolean` | True while any async action is in flight |
| `error` | `string \| null` | Last error message; cleared on next action |
| `sendRequest()` | `() => Promise<boolean>` | POST `/chat/requests` |
| `acceptRequest()` | `() => Promise<string \| null>` | PATCH `/chat/requests/:id/accept` — returns new `conversationId` |
| `declineRequest()` | `() => Promise<boolean>` | PATCH `/chat/requests/:id/decline` |
| `disconnect()` | `() => Promise<boolean>` | DELETE `/chat/connections/:userId` |
| `block()` | `() => Promise<boolean>` | POST `/profile/me/block/:userId` |
| `unblock()` | `() => Promise<boolean>` | DELETE `/profile/me/block/:userId` |

Syncs from props when `targetUserId` transitions from `''` (not yet loaded) to a real UUID. Used by Discover and the public profile page.

---

## Dev Tools

### `ColorPalettePanel` — `components/DevColorPalette.tsx`

Live theme editor accessible via the **Colors accordion** in the desktop sidebar — visible only when Hidden Zone is active (`isHidden = true`). No floating button; no prod/dev gate — always available in Hidden Mode.

| Feature | Description |
|---|---|
| Color picker | All CSS custom properties (`--color-*`) shown as editable swatches; changes apply instantly via `document.documentElement.style.setProperty` |
| Element picker | 🖱 pick mode — crosshair cursor; hover highlights elements with a dashed outline; click captures computed `backgroundColor`, `color`, `borderColor` and highlights any matching CSS vars in the palette |
| Theme presets | One-click switch between `dark`, `light`, `underground-brick`, `underground-neon` |
| Custom themes | Save the current palette under a name (stored in `localStorage['dev-color-themes']`); load or delete saved themes |
| Export | Copies the full palette as a `.my-theme { … }` CSS block to the clipboard |
| Reset | Removes all inline `style` overrides from `<html>`, reverting to the active CSS-class theme |

### `DevQuickFight` — `components/beef/DevQuickFight.tsx`

Floating panel (⚡ DEV, bottom-right) for instant beef game creation without going through the normal approval flow. Mounted on the `/beef` page.

| Field | Description |
|---|---|
| Target User ID | UUID of the opponent |
| Game Type | `tictactoe` / `rps` / `mastermind` / `reaction` |

Posts to `POST /hidden/beef/dev/quick-fight` (backend returns 404 in production) and redirects to the created beef's detail page.

---

## Key notes

- `sender_id` on messages is the account UUID. Always use `user.user_id` (not `user.id`) for `isOwn` comparisons.
- Optimistic message send: message appears immediately with a pending indicator, replaced by the confirmed message on `new_message`.

---

## Known gaps

| Area | Gap |
|---|---|
| `TopNav` | Top-right slot shows the 🎰/🧱 theme toggle when `isHidden = true`; shows nothing when `isHidden = false` — profile photo is not loaded there |
| `chat/[id]` header | Generic user icon — partner photo not loaded |
| `BottomNav` | No unread badge on Chat or Requests tabs |
| `chat/[id]` | `read_at` exists on messages but read receipts not rendered |
| `settings` → Konto | GDPR export still downloads a blob, but `GET /gdpr/export` now returns JSON and mails the PDF — the button saves a broken file |
| `/forgot-password` | The reset mail links to `/auth/reset-password`, which doesn't exist (backend `mail.service.ts`); there is no reset page yet |

---

## Changelog

### 2026-10-09 — Analytics
- feat(analytics): owner analytics on `/dashboard` — KPI tiles with sparklines, growth, activity, sign-ups, revenue, funnel, heatmap, plan mix, top interests/cities; table view for every chart; texts in all 9 languages

### 2026-10-07 — Tenant Logo & Favicon
- feat(tenant): logo in the logo button, favicon in the tab, both via `/api/v1/tenant/asset/<file>`; default favicon moved to `public/`

### 2026-10-06 — Multitenant
- feat(tenant): root layout fetches `GET /tenant` on the server — title, `lang`, theme and color tokens in the first HTML; `TenantProvider` for client code
- feat(tenant): brand name, legal pages and footer from the tenant; navigation, dashboard, settings and routes follow the enabled modules (disabled → 404); language picker limited to the tenant's locales
- fix(media): `next.config.ts` rewrites `/api/v1/media/file/*` to the tenant's backend

### 2026-10-05 — Docker Only
- chore(deploy): removed the ngrok header from fetch/socket calls; Docker is the only way to run the stack

### 2026-09-15 – 09-17 — Demo Hardening
- feat(offline): fullscreen offline fallback when `/health` is unreachable
- feat(demo): sticky demo banner on every page; demo hint on the register email field
- feat(auth): `/forgot-password` page
- feat(legal): Impressum/Datenschutz/AGB rewritten and checked against the code, `LegalPageNotice`
- fix(auth): removed the cookie-based route gate (`proxy.ts`) that bounced split-domain logins back to `/login`
- fix(login, verify): `useSearchParams` wrapped in a Suspense boundary
- fix(admin): media images/audio not showing in the MediaTab
- chore(api): `NEXT_PUBLIC_SOCKET_URL` renamed to `NEXT_PUBLIC_WS_URL`
- chore(branding): display name YourBrand → YourDemo (the Hidden Zone password stays `YourBrand`)

### 2026-09-12 — Cleanup
- delete: unused `ErrorCard` component

### 2026-07-23 — Onboarding: Fix Admin/Dashboard Redirect Loop
- fix(onboarding): `/onboarding` force-redirected any `admin`/`owner` role straight to `/dashboard`, while `useBootstrap` force-redirects any account with `onboardingCompleted: false` back to `/onboarding` — an admin account with incomplete onboarding (e.g. the `saos43` demo/test account) bounced between the two routes on every render, tripping the global rate limiter (429s on dashboard/admin endpoints); removed the role-based redirect — onboarding completion is now the only gate for leaving `/onboarding`

### 2026-07-22 — Color Panel: Two New Themes
- feat(theme): two new color schemes, "lavender" and "darkPink", available in the Color Panel (dev tool) — carried over from the b2b-cv/whitelabel showcase (light purple theme + dark pink theme)

### 2026-06-14 — Chat Header Positioning Fix
- fix(chat): chat header in the web view now sticks to the very top (was sitting 64px too low, since the mobile TopNav is hidden on desktop but was still reserving its height)

### 2026-06-13 — Hidden Zone Master Password
- chore(hidden): Hidden Zone master password changed to "YourBrand"

### 2026-06-10 — Discover/Matching UI Fixes
- feat(discover): radius filter slider max increased to 5000 km (was 500 km), matching the backend validation change (see backend changelog)
- feat(matching): "Ablehnungen zurücksetzen" button added to the empty deck state (clears own skips only, not likes) — calls `DELETE /discover/swipes/skips`
- fix(notifications): request-notification badge showed the wrong count — ID mismatch between the socket event and the page fixed; notifications now clear correctly when opening the requests page
- feat(profile): public profile page now shows 💚/🚩 flags on interests (green-/red-flag system)

### 2026-06-09 — Theme Persistence Fixes
- fix(theme): custom theme is now restored immediately on page load, not only once the Color Panel is opened
- fix(theme): self-saved custom themes in the Color Panel now survive F5 and re-login (active theme name persisted to `localStorage`, restored on start)
- fix(theme): deleting or resetting a theme now cleans up the active-theme state correctly
- fix(hidden): Hidden Zone theme and the "visited once" flag are now persisted to `localStorage` (survive F5 and re-login)
- fix(hidden): Colors tab in the sidebar stays visible once the Hidden Zone has been entered at least once

### 2026-06-09 — Matching Page: Swipe + Matches tabs; nav rename
- feat(matches): `/matches` page is now a two-tab Matching hub — "Swipen" (swipe deck with like/skip + match-flash banner) and "Matches" (mutual matches list with photo, age, city, chat button)
- feat(matching): match-flash banner lifted to page level; shows on mutual match with a "Zu deinen Matches" button to switch tabs; card advances after 2 s
- refactor(discover): Discover page is now search-only — swipe tab removed, all swipe code moved to `/matches`
- feat(i18n): `matches.*` section added in all 9 languages (de/en/es/fr/it/ja/ru/de_easy/leet)
- feat(i18n): `nav.matches` renamed to "Matching" in all 9 languages; BottomNav and DesktopSidebar updated

### 2026-06-09 — Colors Tool in Hidden Mode Sidebar; Dev Button removed
- `ColorPalettePanel` als Akkordion in der Desktop-Sidebar (nur Hidden Zone) — floating Button entfernt
- Abmelden-Button-Farbe (`--color-logout`) und Badge-Glow (`--color-nav-badge-glow`) über das Colors-Panel einstellbar

### 2026-06-09 — Sidebar UI Cleanup & Notification Routing
- Notifications-Tab ersetzt die Glocke in der Desktop-Sidebar; Tabs zeigen Unread-Badges mit einstellbarem Glow (`--color-nav-badge-glow`)
- Beef-Notifications (Ergebnisse) landen im Notifications-Tab statt am Beef-Tab
- Status + Coins oben in der Sidebar (über der Navigation), StatusPicker-Dropdown klappt korrekt nach unten auf
- Abmelden-Button-Farbe über `--color-logout` in allen Themes und im Color-Panel einstellbar
- Mobile Bell-Badge nutzt dieselbe Glow-Farbe wie die Desktop-Tab-Badges

### 2026-06-08 — Beef Game System: Game Components & Bugfixes
- fix(reaction): `ReactionGame` registers `game:go` listener **before** emitting `game:reaction_ready` — prevents missed GO signal if backend fires immediately; click payload is `{ beefId }` only (userId from JWT, never from frontend)
- fix(overlay): `GameOverlay` uses `phaseRef` — 5-s pre-game countdown starts only once on `waiting` → `in_game` transition, not on every `game:board_update`
- feat(tictactoe): `TicTacToeGame` — round-result banner (2.5 s between rounds) showing winner or draw; timer hidden during `roundOver` state; `TURN_MS` updated to `25_000`
- feat(rps): `RpsGame` extended to RPSLS — Eidechse (🦎) and Spock (🖖) added to choice grid; `RpsChoice` type includes `'lizard' | 'spock'`
- feat(mastermind): `MastermindGame` — opponent `PlayerBoard` renders attempt count + solved badge when `playerState.redacted`; `MAX_GUESSES` updated to `8`
- fix(tictactoe): turn timer resets immediately after each move (no zero-flash)
- feat(beef/page): `game_pending`/`in_game` beefs shown in Public tab with yellow `🎮 Live!` badge
- feat(beef): `DevQuickFight` — floating dev panel for instant test match creation (hidden in production)

### 2026-06-08 — Beef Game System: Overlay, Timer & Post-Game
- refactor(overlay): `GameOverlay` rendered inline on beef detail page (replaced `fixed inset-0` modal overlay)
- feat(tictactoe): 15-s turn timer with millisecond display, animated red progress bar below 5 s, "Du bist dran" current-player highlight
- feat(beef): `WinnerScreen` — post-game result with 5-s countdown; redirects to exile profile page after close
- refactor: `useCountdown` hook extracted to `lib/hooks/useCountdown.ts` — shared by beef detail page and `WinnerScreen`
- feat(beef/[id]): comment section respects `comment_window_until` — input hidden after the 5-min post-game window

### 2026-06-08 — Beef Game System: Real-time Board Updates
- fix(overlay): `game:board_update` socket event wired in `GameOverlay` — all game components receive live state after each move
- feat: `backdrop-blur-md` overlay behind game area

### 2026-06-07 — Beef Game System: Initial Implementation
- feat(beef/[id]): live beef detail page — participant names, chat passage blockquote, vote bar with wager presets, comment section with send input, winner banner, live countdown timer
- feat(beef): `GameOverlay` component — mounts correct game component based on `game_type` with 5-s pre-game countdown; listens to `game:state_update` / `game:board_update` on `/hidden-beef` socket
- feat(beef/games): `TicTacToeGame`, `RpsGame`, `MastermindGame`, `ReactionGame` initial implementations
- feat(profile): "Beef starten" button on public profile with URL-param pre-fill
- feat(beef/create): duration picker (15 Min / 1h / 6h / 12h / 24h / 48h); `game_type` selector step
- feat(chat): beef creation modal gains step 3 — game type selection; `game_type` sent in `POST /hidden/beef`
- fix(beef): beef target search is now local (no API call on keystroke) via `GET /chat/conversations/partners` fetched once on load

### 2026-06-01 (latest)
- Fix (`TopNav/StatusPicker`): Online-Status-Icon reset nach jedem Page-Reload — Root Cause: Backend liefert `statusMessage`/`statusVisible` (camelCase), Picker las aber `status_message`/`status_visible` (snake_case) → immer `undefined`; `user`-Objekt wird jetzt im Zustand-Store persistiert und nach erfolgreichem PUT sofort aktualisiert

### 2026-06-01
- Fix (`settings`): „Einfache Sprache"-Toggle setzt den Language-Picker automatisch auf „Leichte Sprache" (`de_easy`); beim Deaktivieren wird die vorherige Sprache wiederhergestellt

### 2026-05-31 (latest)
- Fix (`TopNav`): Boxhandschuh-Emoji vom „Beef"-Nav-Link entfernt
- Fix (`mobile`): Toast-Benachrichtigungen erscheinen jetzt unterhalb der TopNav statt dahinter; Bell- und StatusPicker-Dropdown werden auf Mobile als volle Breite unter der TopNav fixiert statt seitlich aus dem Viewport zu fliegen; Admin-Modal-Overlay liegt nun über der BottomNav; Beef-Bottom-Sheet hat mehr Bottom-Padding für den iOS Home Indicator
- Fix (`notifications`): Migration 028 ausgeführt — `content_vars JSONB`-Spalte in der `notifications`-Tabelle nachgezogen; `/notifications` lieferte vorher 500
- Fix (Settings): Sichtbarkeits-Toggles (Bio, Stadt, Alter etc.) waren fälschlicherweise disabled wenn Profil nicht published; jetzt immer bedienbar
- Admin (Meldungen): Tab lädt beim Öffnen nur `open`-Reports; Status-Dropdown entfernt; neuer „History"-Button lädt `reviewed` + `closed` parallel; „← Zurück" kehrt zur Hauptansicht zurück; Suche (Nickname, Gegner, Grund) client-seitig für beide Ansichten
- Admin (Coin & Cash): neuer Owner-only Tab mit zwei Sub-Tabs — Coin Transactions (inkl. House-Cut-Sektion für System-User) und Cash Transactions; client-seitige Suche nach Nickname/Grund bzw. Nickname/Status; Daten kommen von zwei neuen Backend-Endpoints (`GET /admin/owner/coin-transactions`, `GET /admin/owner/cash-transactions`)

### 2026-05-31
- Feat (`settings`, `i18n`): Leetspeak (`1337 5p34k`) als Sprachoption im Language-Picker hinzugefügt

### 2026-05-31
- Fix (`dashboard`): „Mein Überblick"-Sektion (Offene Anfragen, Aktive Chats, Abo-Status) wird für Admin- und Owner-Rollen ausgeblendet

### 2026-05-31
- Feat (`notificationStore`, `useSocketBus`): Admin-Benachrichtigungs-Sound event-driven via `adminSoundTick`-Zähler — beide Events (`ticket.new`, `media:pending_review`) triggern den Sound über einen zentralen `useEffect`
- Fix (`TicketsTab`): alle drei Listen (Meldungen, Support, Medien) aktualisieren sich jetzt in Echtzeit wenn ein Admin-Event eintrifft — kein manuelles Refresh mehr nötig

### 2026-05-31
- Feat (`TicketsTab`): neuer „Medien"-Accordion im Admin-Ticket-Board — zeigt pending Medien-Uploads (Bild/Audio-Icon, Nutzer, Datum, open-Badge); Counter-Badge im Header aktualisiert sich per WebSocket in Echtzeit
- Feat (`TicketsTab`): rote Zahl-Badges auch bei Meldungen und Support-Anfragen im Accordion-Header
- Feat (`useSocketBus`): `media:pending_review` spielt WORK WORK Sound und erhöht Admin-Zähler
- Feat (`dashboard`): Nachrichten-Button und Nachrichten-Karte zeigen korrekte Anzahl ungelesener Chats statt Bell-Notifikations-Count; Anfragen-Karte hat jetzt ebenfalls Badge
- Fix (`dashboard badge`): unread count basiert jetzt auf Conversations-Store statt Notification-Store

### 2026-05-31
- Fix (`beef/[id]/page.tsx`): Vote-Balken zeigt jetzt zwei deutliche Farben — Rot für Initiator, Blau für Target; vorher war nur eine Seite eingefärbt

###  2026-05-31
- Feat (`HiddenEntryOverlay`): Hidden-Zone Eingabe-Screen komplett neu — 5 Filme rotieren zufällig, jeder Film hat eigenen Soundtrack und 10 Quotes mit Typewriter-Effekt; Passwort = normalisierter Filmtitel; Master-Key weiterhin gültig
- Fix (`HiddenEntryOverlay`): Musik startet erst wenn der Passwort-Screen erscheint (nicht beim Seitenaufruf); kein Filmtitel sichtbar; leeres Eingabefeld
- Fix (`admin/page.tsx`): Tab-Bar Buttons verteilen sich gleichmäßig über die volle Breite

### 2026-05-30 (latest)
- Fix (`layout.tsx`): Footer klebt nicht mehr direkt unter dem Content — `flex flex-col min-h-screen` + `flex-1` auf `<main>` drückt ihn auf allen Screens ans untere Ende
- Fix (`HiddenShortcut.tsx`): Hidden-Zone Easter Egg triggert jetzt nach 6 Logo-Klicks statt 13

### 2026-05-30
- Fix (`chat/[id]/page.tsx`): alle Nachrichten wurden links angezeigt, weil `currentUserId` immer `null` war — Auth-Store persistiert `user` nicht; jetzt `selectUserId` (liest `sub` aus JWT) an allen drei Stellen
- Fix (`beef/page.tsx`): Coin-Kauf-Bestätigung nach Stripe-Redirect schluckte Fehler lautlos; jetzt Erfolgs-Banner mit Coin-Anzahl, automatische Weiterleitung zurück zur vorherigen Seite
- Fix (`HiddenShortcut.tsx`): aktuelle URL wird vor Stripe-Redirect in `localStorage` gespeichert, nach erfolgreichem Kauf wiederhergestellt

### 2026-05-29 (latest)
- Bug fix (`hooks/useBootstrap.ts`): `user.onboarding_completed` → `user.onboardingCompleted` — matches camelCase JSON from backend; was causing the onboarding redirect to never trigger
- Bug fix (`lib/store/authStore.ts`): `onboardingCompleted?: boolean` added to `User` interface — `[key: string]: unknown` had silently allowed the misspelled snake_case access without a type error
- Bug fix (`components/nav/NotificationBell.tsx`): missing `useAuthStore` import added — caused `useAuthStore is not defined` runtime crash
- Bug fix (`app/layout.tsx`): `<Script strategy="beforeInteractive">` moved from `<head>` to start of `<body>` — Next.js throws a React rendering error for inline script children inside `<head>`
- `lib/api.ts`: `tryRefresh()` now uses a singleton promise lock (`refreshPromise`) — prevents concurrent 401 responses from each firing their own refresh, which consumed the single-use token and caused a cascade of failed refreshes and redirect loops
- Admin (`/admin`): `tabsReady` gate added — tab panels only mount after hydration and role confirmation to prevent unauthenticated API bursts; `useAuthStore()` replaced with a selector (`(s) => s.accessToken`) to suppress unnecessary re-renders; `router` accessed via ref in the redirect effect to remove it from deps

### 2026-05-29
- Hidden Zone consolidated into `hooks/useHiddenZone.ts`: absorbs audio logic (deleted `lib/hiddenAudio.ts`), CSS theme class application, and logout lock from `HiddenInitializer`; exposes `checkPassword()` used by `HiddenEntryOverlay`; `HiddenInitializer` reduced to a 3-line rendering adapter

### 2026-05-29
- `TopNav` split into 4 focused sub-components: `NotificationBell` (bell dropdown + notification fetch), `StatusPicker` (status dot + dropdown + API writes), `AdminBadge` (ticket inbox icon + initial count fetch), `HiddenShortcut` (logo 13-click Easter egg + coin balance + theme toggle + shop modal via React portal); `TopNav` reduced to a thin layout shell with no local state or effects

### 2026-05-28 (latest)
- Notifications: `notificationStore` — `NotificationType` extended with `beef_request`, `beef_accepted`, `beef_won`, `beef_lost`; `notifications/page.tsx` — `TYPE_ICONS` (Swords / Trophy) and `TYPE_LABELS` wired for all four beef notification types
- Chat (`/chat/[id]`): beef creation modal — duration selector added to TLDR step (6 presets: 15 Min / 1 Stunde / 6 Stunden / 12 Stunden / 24 Stunden / 48 Stunden); selected `duration_seconds` sent in `POST /hidden/beef` body; resets to 86400 on modal close
- Admin (`/admin`): beef approval cards now have an "Ablehnen" button alongside "Approve"; `handleBeefReject` calls `DELETE /hidden/beef/:id/reject` and reloads the pending list
- Profile (`/profile`): exile status banner added between the photo section and the nickname warning — shown when `isHidden && exileUntil !== null`; "Verlassen" button calls `POST /hidden/beef/exile/leave` and clears state; exile fetched from `GET /hidden/beef/exile/status` on mount when `isHidden`
- Profile (`/profile`): **Underground Stats** section added between Bio and Interests — visible when `isHidden && hiddenStats !== null`; shows coin balance, tooth count, chain count in a 3-column grid; active badges listed as pills with icon + expiry countdown; data fetched from 4 endpoints in parallel (`/hidden/coin/balance`, `/hidden/teeth`, `/hidden/teeth/chains`, `/hidden/badge/mine`)
- Beef zone (`/beef`): **Highscore tab** implemented — fetches `GET /hidden/beef/highscore` in parallel with other data on load; renders ranked leaderboard with gold (#1) / silver (#2) / bronze (#3) color coding; empty state when no closed beefs
- New page: **`app/beef/[id]/page.tsx`** — live beef detail view; shows participant names (initiator vs target), chat passage blockquote, coin vote distribution bar with percentages, wager preset buttons (1 / 5 / 10 / 50 / 100 coins), vote buttons (disabled for participants or when already voted), "Already voted" confirmation panel, Double KO banner, winner trophy, live countdown timer; comment section with per-10s polling when beef is active and a send input; `params` typed as `Promise<{ id: string }>` using React `use()` hook

### 2026-05-28
- `TopNav`: coin balance pill added to the action row — visible only when `isHidden = true` and balance has loaded; fetches `GET /hidden/coin/balance` whenever the hidden zone becomes active, clears on zone exit; rendered as a rounded pill with a `Coins` icon (lucide-react) and `tabular-nums` balance count before the theme toggle button
- `HiddenInitializer`: logout lock rewritten as transition-aware — now uses `isFirstRun` + `prevToken` refs so `lock()` and `stopHiddenAudio()` only fire when the token transitions from non-null → null (actual logout), not on initial mount; prevents the hidden zone from locking on first render when `accessToken` is already set
- Beef (`/beef`): hydration gate added — `useHiddenStore.persist.hasHydrated()` checked synchronously on mount, with `onFinishHydration` subscription for the async case; redirect guard waits for hydration before evaluating `isHidden`; early return renders `null` during hydration to prevent flash-redirect to `/dashboard` on F5
- i18n `lib/i18n/leet.ts`: fixed truncated file — was cut off mid-string at `changeEmail: 'Ch4n63 3`; completed the `changeEmail` value and added all missing sections: settings tail (24 entries: `currentPassword` → `deleteAccountConfirm`), `chat` (35 entries), `ban` (3 entries), `report` (17 entries), `support` (13 entries), `admin` (63 entries including moderation, strike, profanity, and management strings); TypeScript compile now passes cleanly

### 2026-05-27 (latest)
- Chat (`/chat/[id]`): **Beef flow** — Swords button added to conversation header (visible only when `isHidden = true`); opens a two-step bottom-sheet modal: step 1 enters a TLDR (max 50 chars); step 2 selects a passage range — tap first message to set START, tap another to set END (highlights contiguous range with `bg-primary-fixed-dim/20` border and START/END labels); tapping a third message resets selection; submit posts `{ target_id, tldr, chat_passage }` to `POST /hidden/beef`; `closeBeef()` resets all state on dismiss or success
- Admin (`/admin`): **Beef tab** — visible to `admin`, `owner`, and hidden-zone users; loads `GET /hidden/beef/pending` on tab select and on role hydration; each card shows initiator vs target nicknames (joined server-side), TLDR, chat passage blockquote, creation timestamp, and an Approve button (`PATCH /hidden/beef/:id/approve`); pending count badge on tab button and in the admin header
- Beef (`/beef`): **Full redesign** — 4 tabs: **Anfragen** (incoming WAITING beefs, Fight 🥊 / Chicken 🐔 respond buttons, `POST /hidden/beef/:id/respond`), **Meine Beefs** (ACTIVE beefs involving the caller, `GET /hidden/beef/my-active`), **Public** (ACTIVE beefs not involving the caller, `GET /hidden/beef/public`), **Highscore** (placeholder); all three lists fetched in parallel on page load; red badge on title and Anfragen tab when incoming count > 0; `Flame` icon added for Meine Beefs tab

### 2026-05-27
- Hidden Zone: `lib/store/hiddenStore.ts` — Zustand store (`isHidden`, `theme`, `toggleTheme`, `clickCount`, `openOverlay`, `unlock`, `lock`, `passwordAttempts`, `incrementPasswordAttempts`, `resetClickCount`)
- Hidden Zone: `lib/hiddenAudio.ts` — singleton audio module; `playHiddenAudio()` starts "Where Is My Mind" (looping, 50 % volume) when the overlay opens (900 ms after the logo animation fires); `stopHiddenAudio()` called on logout
- Hidden Zone: `lib/physics/letterPhysics.ts` — DOM letter physics: logo letters shake and break apart on the 13th click; particle explosion plays on correct password; failed-attempt text spawns and scatters from the input field
- Hidden Zone: `components/HiddenEntryOverlay.tsx` — password dialog with SVG tally marks for failed attempts; correct password triggers explosion animation then `unlock()`
- Hidden Zone: `components/HiddenInitializer.tsx` — watches `isHidden` + `theme`; adds/removes `underground-brick` / `underground-neon` on `<html>`; calls `stopHiddenAudio()` + `lock()` when `accessToken` becomes `null`
- Hidden Zone: new route `app/beef/` — Beef arena page (accessible when `isHidden = true`); added to nav as "Beef 🥊" link
- `TopNav`: logo now counts clicks (reset after 3 s of inactivity); at 13 clicks fires physics animation and opens overlay with audio after 900 ms delay; theme toggle button (🎰/🧱) shown in top-right slot when `isHidden = true`, slot empty otherwise (removed the `?` placeholder)
- `app/(app)/layout.tsx`: `<HiddenThemeToggle />` removed (toggle moved inline to `TopNav`); `HiddenInitializer` added
- `components/HiddenThemeToggle.tsx`: deleted — functionality absorbed into `TopNav`
- `public/sounds/where_is_my_mind.mp3`: audio file added (renamed from original, spaces/special chars removed)

### 2026-05-26 (latest)
- New screens: `app/not-found.tsx` (404), `app/error.tsx` (runtime error boundary), `app/global-error.tsx` (root error boundary) — all use existing CSS variables for automatic dark/light mode; `global-error.tsx` wraps in `<html><body>`, imports `globals.css`, re-runs the theme-init script, and falls back to inline `var(--color-..., hardcoded-dark)` styles in case the stylesheet fails to load
- New component: `ErrorCard` (`components/ui/ErrorCard.tsx`) — compact named-export card for inline section errors; props: `title`, `message`, `onRetry?`, `retryLabel?`
- Root page (`app/page.tsx`): replaced design-system scaffold with `redirect('/dashboard')`
- Not-found page: "Zurück zur Startseite" button now points to `/dashboard` instead of `/`

### 2026-05-26
- New component: `CityAutocomplete` (`components/ui/CityAutocomplete.tsx`) — autocomplete input that queries `GET /cities/search?q=` as the user types; shows dropdown with city name, country, and region; exposes selected city's `lat`/`lng` to the parent
- Discover (`/discover`): city filter replaced with `CityAutocomplete`; radius slider added (10–500 km, step 10, disabled until a city is selected); search sends `lat`, `lng`, `radius` when a city is chosen from autocomplete rather than a free-text city string
- Profile edit (`/profile`): city field replaced with `CityAutocomplete`; selected city coordinates are sent alongside the city name in `PUT /profile/me`
- Onboarding: city step uses `CityAutocomplete`; `cityLat`/`cityLng` stored in form state and included in `PUT /profile/me` on wizard completion
- Dashboard (`/dashboard`): full redesign — role badge (Crown/Shield) shown in welcome heading for owner/admin; "Mein Überblick" stat row for all users (pending requests, active chats, subscription via `GET /admin/dashboard/user-stats`); "Moderations-Überblick" (admin + owner) via `GET /admin/dashboard/admin-stats`; "Plattform-Übersicht" (owner only) via `GET /admin/dashboard/stats`; Admin quick-link button shown to admin/owner users
- Admin (`/admin`): new "Dashboard" accordion in Verwaltung tab (owner only) — lazy-loads platform stats via `GET /admin/dashboard/stats` with a refresh button and skeleton loading
- Admin (`/admin`): strikes list search refactored to use new `useSearch` hook (replaces manual debounced state)
- AuthProvider: `new_message` notifications now show `"{sender_nickname} hat dir eine Nachricht geschickt."` instead of the generic "Neue Nachricht" (`sender_nickname` field added to `MessagePayload` type)

### 2026-05-26
- Settings (`/settings`): "Abonnement & Zahlung" section hidden entirely for `admin` and `owner` users
- Settings (`/settings`): plan selection buttons now show prices fetched from `GET /system-settings/prices` (e.g. "Monatlich — €9.99"); prices are loaded on page mount
- Settings (`/settings`): "Passwort ändern" and "E-Mail ändern" implemented as nested sub-accordions inside the **Konto** section (replacing "Bald verfügbar" placeholders); each has show/hide password toggles and inline success/error states
- Settings (`/settings`): `uiLang` state migrated from local `useState` to `languageStore` (Zustand) — language preference now survives component remounts
- Auth layout (`(auth)/layout.tsx`): sticky footer added with copyright year (`NEXT_PUBLIC_COPYRIGHT_YEAR`), brand name (`NEXT_PUBLIC_BRAND_NAME`), and Impressum / Datenschutz links
- Admin (`/admin`): new **Abonnement-Preise** accordion in the **Verwaltung** tab — owner can edit monthly/yearly/lifetime prices via `PATCH /system-settings/prices`; prices are pre-loaded from `GET /system-settings/prices`; confirmation modal before saving with a Stripe sync reminder
- Chat (`/chat/[id]`): "Chat löschen", "Nutzer blockieren", and "Nachricht löschen" confirmation dialogs changed from bottom sheets to centered modals
- i18n: `useTranslation()` hook and `t.*` keys applied throughout chat, settings, admin, and auth pages — all UI strings now go through the translation layer

### 2026-05-24 (latest)
- Auth (`/login`): login now accepts email **or** nickname via `identifier` field; "Support kontaktieren" link opens `ContactSupportModal`; `?setup=done` query param shows a green success banner
- New route: `/setup` — one-time owner bootstrap wizard; checks `GET /setup/status` on load, redirects to `/login` if setup is already complete; creates owner account via `POST /setup`
- New component: `ContactSupportModal` (`components/ui/ContactSupportModal.tsx`) — anonymous support form (email required, nickname + public ID optional, message required); submits to `POST /support/contact`; shows success confirmation state; rate-limited by backend (3/hour)
- Settings (`/settings`): "Passwort ändern" fully implemented — inline accordion sub-section with current password + new password (show/hide toggles); calls `PATCH /auth/change-password`; success toast + fields cleared on success
- Settings (`/settings`): "E-Mail ändern" fully implemented — inline accordion sub-section with current password + new email; calls `PATCH /auth/change-email`; success toast + fields cleared on success
- Admin (`/admin`): owner-aware access — `isOwner` flag derived from JWT role; auth guard now allows `admin` **or** `owner`; **Verwaltung** tab shown to owners only
- Admin (`/admin`): new **Verwaltung** tab (owner only) — (A) paginated admin list via `GET /admin/admins`; (B) "Admin erstellen" form via `POST /admin/users/create`
- Admin (`/admin`): **Einstellungen** tab now owner-only (was visible to all admins)
- Admin (`/admin`): support tickets surfaced in **Tickets** tab alongside moderation tickets; `AdminTicket` interface with `source` and `context` fields (email, nickname, public_id, message)
- i18n: `lib/i18n/` module introduced — `useTranslation()` hook, `languageStore` (Zustand), German source-of-truth with typed `en` / `leicht` stubs; used throughout login, setup, settings, and admin pages

### 2026-05-23 (latest)
- Admin (`/admin`): new **Swipe View** for media moderation — full-screen overlay with one card at a time; approve with → key / right arrow button / right swipe, reject with ← key / left arrow button / left swipe; audio cards show filename + Play/Pause (Spacebar); type filter (Alle / Fotos / Audio); counter ("3 von 12"); tilt animation on action; replaces the grid-of-cards approach for faster review
- Admin (`/admin`): `AdminStrike` type gains `ban_lifted_at` field (was missing from the interface)
- Onboarding: merged three-step profile info flow (separate Nickname, Birthdate+City, and Bio steps) into a single **StepProfileInfo** step — all required fields (nickname, birthdate, city) validated together before advancing; optional fields (bio, gender, looking_for) remain on later steps
- Onboarding: added `useTranslation` hook integration — step 1 welcome text and CTA now use `t.onboarding.*` keys from `config/translations.ts`
- New hook: `hooks/useConnectionAction.ts` — `useConnectionAction(targetUserId, initialStatus, initialRequestId, initialConversationId)` centralises all connection state mutations (send request, accept, decline, disconnect, block, unblock) with shared `isLoading` / `error` state; syncs from props when `targetUserId` transitions from `''` to a real value; used by Discover and public profile
- Discover (`/discover`) + Public profile (`/profile/[nickname]`): refactored to use `useConnectionAction` — removed per-page duplicated fetch logic and state (`busy`, `disconnecting`, `blocking`, `requestStatus`, `requestError`, etc.)
- Public profile: `PublicProfile` type gains `request_id` and `conversation_id` fields (needed by `useConnectionAction`)
- Chat (`/chat/[id]`): block banner text corrected — "Du kannst diesem Nutzer keine Nachrichten senden." → "Du hast diesen Nutzer blockiert."; blocked input field now shows `bg-surface-container-high opacity-50 cursor-not-allowed` styling instead of plain disabled
- Own profile (`/profile`): "Ersetzen" and "Neue Aufnahme" audio action buttons now only shown in edit mode (were always visible when audio had status pending or rejected)
- TopNav: status dot in the status button now shows green whenever the user is logged in (`!!accessToken`) instead of checking `statusVisible` — prevents the dot going grey when the user sets themselves to invisible (which is the backend's job, not the dot's)
- `AuthProvider`: minor formatting refactor — `return` now uses explicit JSX wrapping instead of a fragment expression
- New: `config/translations.ts` — `translations` object with German source-of-truth (`de`) and empty `en` / `leicht` stubs typed via `DeepPartial<TranslationKeys>`; `TranslationKeys` inferred from German so TypeScript surfaces every missing key when a stub is promoted
- New: `hooks/useTranslation.ts` — `useTranslation()` hook reads `lang_simple` from auth store to select the active locale

### 2026-05-23

### 2026-05-22 (latest)
- Auth: ban state now derived from backend on every app startup — `AuthProvider` checks `user.is_banned` in the `/profile/me` response and calls `setBanned(true)` if true. Stale ban state no longer survives across sessions.
- Auth: `isBanned` removed from Zustand `partialize` — no longer written to `localStorage`. In-memory only; reset to `false` on logout.
- Auth: `User` interface gains optional `is_banned?: boolean` field.
- Auth: `AuthProvider` onboarding redirect now also guards on `!user.is_banned` (banned users are not redirected to `/onboarding`).
- New component: `BanScreen` (`components/ui/BanScreen.tsx`) — full-screen ban overlay; plays a random looping audio from `public/ban-audio/`; shows configurable ban text in rubber-stamp style; "Abmelden" button clears auth and redirects to `/login`. Rendered by `AuthProvider` when `isBanned` is true.
- New component: `BanModal` (`components/ui/BanModal.tsx`) — admin ban form; duration dropdown (24h/7d/30d/permanent), reason dropdown (5 presets), optional note (500 chars). Posts `{ duration, reason, report_id? }` to `PATCH /admin/users/:id/ban`.
- Admin (`/admin`): Nutzer tab uses `BanModal` instead of the old inline form; `banModal` state now carries `{ userId, nickname, reportId? }`.
- Admin (`/admin`): Strike modal replaced UUID text input with a debounced nickname search — type a nickname, pick from results, `user_id` resolved automatically.
- New `config/public.config.ts` — `PUBLIC_CONFIG` with `banScreen.text` (from `NEXT_PUBLIC_BAN_SCREEN_TEXT` env var) and `banScreen.audioFiles` array.
- New `public/ban-audio/` — 8 audio files served statically for the ban screen.

### 2026-05-22
- Chat (`/chat/[id]`): three-dot menu in the header — "Chat löschen" (soft-delete own copy, navigates to `/chat`), "User melden" (opens `ReportModal`), "Nutzer blockieren" (bottom sheet confirmation → `POST /profile/me/block/:userId`).
- Chat (`/chat/[id]`): block state loaded from `is_blocked` / `blocked_by` on conversation fetch; input and send button disabled when blocked; block banner shown in the input bar; partner name replaced with "XXXX" when blocked.
- Discover (`/discover`): connected profiles now show a "Verbindung trennen" button below "Chatten →"; confirmation bottom sheet calls `DELETE /chat/connections/:userId` and resets connection status to NONE.
- Public profile (`/profile/[nickname]`): "Verbindung trennen" button for connected profiles (bottom sheet confirmation); "User melden" button opens `ReportModal`; "Nutzer blockieren" button (bottom sheet confirmation → `POST /profile/me/block/:userId` → navigates back). `connection_status` field added to `PublicProfile` type.
- Settings (`/settings`): new **E) Sicherheit & Blockierungen** accordion section — blocked user list lazy-loaded from `GET /profile/me/blocks`; inline unblock flow with confirmation.
- Settings (`/settings`): new **G) Support** accordion section — "Problem melden" button opens `ReportModal` in nickname-lookup mode.
- New component: `ReportModal` (`components/ui/ReportModal.tsx`) — report modal with reason dropdown (5 options), optional description (500 chars), optional nickname lookup when `reportedUserId` is omitted. Used from chat page, public profile, and settings.

### 2026-05-21 (latest)
- Payment: `POST /payment/subscriptions` now returns `{ clientSecret }` (Stripe Embedded Checkout). `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` added to `.env.local`.
- Settings: "Abonnement & Zahlung" accordion filled — active subscription shows plan label (Monatlich / Jährlich / Lebenslang), "Aktiv" badge, and expiry date (hidden for lifetime); inline cancel confirmation flow calls `DELETE /payment/subscriptions/:id`; no subscription shows three plan buttons opening `StripeCheckoutModal`; subscription detail lazy-loaded on accordion open.
- New `StripeCheckoutModal` component (`components/ui/StripeCheckoutModal.tsx`) — Stripe Embedded Checkout in a fixed full-screen modal overlay; fetches `clientSecret` on mount via `POST /payment/subscriptions`.
- `package.json`: added `@stripe/react-stripe-js` and `@stripe/stripe-js`.

### 2026-05-21
- Layouts: footer added to both `(app)` and `(public)` layouts — copyright, brand name, Impressum and Datenschutz links; `(app)` footer uses `mb-16 md:mb-0` to clear the fixed BottomNav on mobile
- Legal pages: `app/(public)/impressum/page.tsx` — Impressum (§ 5 ECG / § 5 TMG) with company details from `NEXT_PUBLIC_COMPANY_*` env vars
- Legal pages: `app/(public)/datenschutz/page.tsx` — full Datenschutzerklärung (7 sections: Verantwortlicher, Erhobene Daten, Zweck, Rechtsgrundlage, Speicherdauer, Rechte, Kontakt) sourced from env vars
- B2B page: contact section (WhatsApp, Instagram, E-Mail, Telefon) wired to `NEXT_PUBLIC_CONTACT_*` env vars instead of hardcoded values
- `.env.local`: `NEXT_PUBLIC_COMPANY_*` and `NEXT_PUBLIC_CONTACT_*` env var groups added
- `TopNav`: admin icon (`Shield`) removed from desktop nav links
- `TopNav`: status dot replaced — `OnlineIndicator` now renders inside the status button with label text suppressed via CSS wrapper (`[&>span>span:last-child]:hidden`)
- `TopNav`: Settings link now visible on all screen sizes (was `hidden md:inline-flex`)
- `BottomNav`: Settings item removed; nav now has 5 items (Home, Discover, Requests, Chat, Profile)
- `AudioPlayer` component (`components/ui/AudioPlayer.tsx`): custom player replacing all native `<audio controls>` instances — Play/Pause toggle, clickable seek bar, `MM:SS / MM:SS` timestamp; progress driven by `requestAnimationFrame` for smooth animation; colors use `text-primary-fixed-dim` / `bg-primary-fixed-dim`
- Own profile (`/profile`): both audio players replaced with `AudioPlayer`; audio delete button now only shown in edit mode
- Public profile (`/profile/[nickname]`): audio player replaced with `AudioPlayer`
- WebSocket (`AuthProvider`): global `notification` and `contact_request` socket event listeners added — real-time delivery without polling

### 2026-05-21
- Settings (`/settings`): full rewrite as 4-section accordion (Design & Barrierefreiheit, Benachrichtigungen, Sichtbarkeit, Konto) — single section open at a time with CSS grid-rows height transition
- Settings: new Sichtbarkeit section — master `is_published` toggle + 7 field visibility toggles (`status_visible`, `show_bio`, `show_city`, `show_age`, `show_gender`, `show_interests`, `show_audio`); all auto-save via `PUT /profile/me`; sub-toggles dimmed (not reset) when `is_published = false`
- Settings: Konto section — subscription info from `profile.subscription` (plan badge + status + expiry date, or "Kein aktives Abonnement"); placeholder rows for Passwort ändern, E-Mail ändern, Konto löschen (all "Bald verfügbar"); "Daten exportieren (PDF)" is fully functional — calls `GET /gdpr/export`, triggers blob download, shows cooldown/error feedback and DSGVO hint text
- Public profile (`/profile/[nickname]`): city hidden when `null` (was showing `—`); gender and looking_for shown as chips when non-null (German labels, `not_specified` excluded)
- Discover (`/discover`): `calcAge` now accepts `string | null | undefined` and returns `number | null`; age hidden in card when `null` (birthdate not returned by backend when `show_age = false`); `birthdate` typed as `string | null`

### 2026-05-21
- Admin panel (`/admin`): full admin UI — media moderation (approve/reject with reason), paginated user management (ban/unban/role), report management (status + note), strike creation, custom profanity word list (add/delete)
- Admin auth guard: fixed premature redirect on first render — `useAuthStore.persist.hasHydrated()` + `onFinishHydration` subscription ensures Zustand `persist` has loaded before the JWT role is checked
- Admin media tab: `toProxyUrl()` helper strips absolute origin from `file_url` before setting `<img src>`, routing photos through the Next.js `/uploads/` proxy
- `lib/api.ts`: `fetchApi` now returns `undefined` for 204 / zero-content-length responses instead of throwing a JSON parse error

### 2026-05-20
- Profanity filter: new `lib/profanity.ts` — `leo-profanity` wrapper (`initProfanityFilter`, `blurText`, `hasProfanity`)
- `AuthProvider`: calls `initProfanityFilter()` on login/refresh to load the custom word list from `GET /moderation/wordlist`
- Chat (`/chat/[id]`): `MessageBubble` applies `blurText()` to incoming messages when `profanity_filter = true` on the current user's profile
- Public profile (`/profile/[nickname]`): `blurText()` applied to bio and `status_message` when `profanity_filter = true`; `photo_needs_review` field added to `PublicProfile` type
- Settings (`/settings`): "Schimpfwortfilter" toggle added under Theme (auto-saves `profanity_filter` via `PUT /profile/me`); `profanity_filter` field added to `Profile` type
- Discover (`/discover`): `photo_needs_review` field added to `Profile` type; photos with `photo_needs_review = true` show blur + "Wird überprüft" badge on the card
- Own profile (`/profile`): `photo_needs_review` field added to `Profile` type; photo gets an error ring + "Wird überprüft" badge when `photo_needs_review = true` (hidden during a fresh upload preview)
- `package.json`: added `leo-profanity ^1.9.0`

### 2026-05-31
- Branding: replaced all visible "XXX" UI text with "YourBrand" — covers JSX renders (onboarding layout, auth layout, nav logo button), browser tab title, and all i18n locale files (`de`, `de_easy`, `en`, `es`, `fr`, `it`, `ja`, `leet`, `ru`); aria-labels and non-rendered strings unchanged
- B2B page (`/b2b`): removed copyright footer (`© 2025 YourBrand · White-Label SaaS für Organisationen`)

### 2026-05-19
- New `OnlineIndicator` component (`components/ui/OnlineIndicator.tsx`) — green/gray dot + translated status label, accessible `aria-label`, sizes `sm`/`md`
- Chat list (`/chat`): green/gray ring dot overlaid on avatar; status_message label shown below message preview via `OnlineIndicator`; both driven by new `partner_is_online` / `partner_status_message` fields from the conversations API
- Chat header (`/chat/[id]`): `OnlineIndicator` shown below partner nickname; partner public profile fetched after nickname resolves to get `is_online` and `status_message`
- Public profile (`/profile/[nickname]`): `OnlineIndicator` (size `md`) shown below city; `PublicProfile` type extended with `is_online` and `status_message`
- Discover (`/discover`): `Profile` type extended with `status_message`; status label rendered in card info section below city when set
- Settings (`/settings`): "Datenschutz & Sichtbarkeit" section now includes "Online-Status anzeigen" toggle (`status_visible`) and Status dropdown (`status_message`); both auto-save to `PUT /profile/me` with optimistic update + toast
- `conversationStore`: `Conversation` type extended with `partner_is_online`, `partner_status_visible`, `partner_status_message`, `partner_last_active_at`

### 2026-05-19
- Settings: "Abmelden" (logout) button added to the Konto section — calls `POST /auth/logout` to clear the HttpOnly cookie, then clears Zustand store and redirects to `/login`; logout still succeeds if the backend request fails
- Settings: "Konto löschen" now functional — calls `DELETE /auth/account`, on success clears auth store and redirects to `/login`; shows inline error on failure with loading spinner during the request

### 2026-05-14
- Profile: clickable avatar triggers hidden file input — uploads to `POST /media/upload/profile-photo` as `multipart/form-data`
- Profile: client-side validation before upload — rejects non-image MIME types and files over 5 MB
- Profile: photo displayed immediately after successful upload; restored on page refresh via `photo_url` from `GET /profile/me`
- Profile: `photo_url` typed in `Profile` interface; pathname extracted from full URL so Next.js proxy handles the request
- `next.config.ts`: rewrite rule proxies `/uploads/*` to `http://localhost:3000/uploads/*` (avoids cross-origin image load)

### 2026-05-08 (latest)
- WebSocket moved to global `AuthProvider` — real-time notifications on all pages
- Notification center (`/notifications`) with type filters and mark-as-read
- Bell badge in `TopNav`: glow + pulse on unread, dropdown preview of last 5
- `setNotifications` merges `_local` entries instead of overwriting them
- Debug console.log statements removed from socket, store, and chat modules

### 2026-05-07
- `profile/page.tsx`: full profile editor — nickname/bio/city edit mode, interest add/remove, publish button, onboarding progress sidebar
- `settings/page.tsx`: accessibility settings with auto-save + live preview; notification toggles; delete account modal; DSGVO section
- Chat list: partner nickname resolved via `GET /profile/user/:id`
- Chat detail: partner nickname shown in header; typing indicator cleared on new message

### 2026-05-07
- Chat page: WebSocket support — real-time messages, typing indicator, read receipts, optimistic sends
- `isOwn` now uses `user.user_id` (account UUID) not `user.id` (profile UUID)
- `AuthProvider`: fixed double-fetch with `hasFetched` ref (React StrictMode-safe)

### 2026-05-04
- Initial setup: Next.js, Tailwind v4, navigation, auth flow, Zustand auth store, dashboard, discover, chat, requests
