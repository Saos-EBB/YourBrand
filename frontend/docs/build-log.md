## 2026-09-17 — fix(media): loading="lazy" gegen ngrok-Free-Concurrency-Refusals
**Was:** Nach dem Backend-Proxy-Fix (siehe `backend/docs/build-log.md`) meldete der User weiterhin
fehlende Fotos, Browser-Konsole zeigte `net::ERR_HTTP2_SERVER_REFUSED_STREAM` fuer viele
Bild-Requests gleichzeitig — bestaetigt als ngrok-Free-Tier-Limit fuer gleichzeitige Streams auf
einem Tunnel, ausgeloest weil Seiten wie Discover/Matches/Beef-Listen mehrere Profilfotos auf
einmal laden, alle durch denselben einzigen Tunnel. `loading="lazy"` auf allen ~15 `<img>`-Stellen
ergaenzt, die echte, ueber's Netzwerk geladene Profilfotos rendern: Discover, Matches (Card +
Grid), Chat-Liste + Chat-Detail (3 Stellen), Beef-Liste + Beef-Detail (2 Stellen), WinnerScreen,
GameOverlay, eigenes Profil (2 Seiten), Settings-Blocklist, Admin-MediaTab (Grid + Swipe-View).
NICHT ergaenzt: `RaygunButton.tsx`s statische Icons, `onboarding/page.tsx`s Foto-Vorschau
(`URL.createObjectURL`, lokaler Blob, kein Netzwerk-Request) — beide irrelevant fuer das Problem.
**Nicht gebaut:** keine Pagination/Lazy-Rendering der Listen selbst — reduziert gleichzeitige
Requests beim initialen Laden, loest aber nicht zwingend jede Seite, die trotzdem viele Fotos auf
einmal im sichtbaren Bereich zeigt. Das ist eine echte ngrok-Free-Plan-Grenze, kein Code-Bug.
Verifiziert: `tsc --noEmit` sauber, `eslint`-Delta gegen unberuehrte Kopien der 2 Dateien mit
zusaetzlichen Treffern (GameOverlay.tsx, WinnerScreen.tsx) zeigt identische, vorbestehende
Befunde — keine Regression. `npm run build` gruen, 25 Routen.

## 2026-09-17 — fix(admin): Media-Bilder/Audio im Admin-Tool zeigten nichts
**Was:** `components/admin/shared/utils.ts`s `toProxyUrl(url)` machte `new URL(url).pathname` —
warf Protokoll+Host komplett weg. `media_uploads.file_url` ist aber eine volle absolute URL zum
MinIO-Objektspeicher (`http://localhost:9000/yourbrand-media/...`, per DB-Abfrage verifiziert,
kommt aus `S3_PUBLIC_URL_BASE`). Nach dem Strip blieb nur `/yourbrand-media/...` — eine relative
URL, die der Browser gegen den EIGENEN Frontend-Origin aufloest (z.B. `:3001/yourbrand-media/...`),
nicht gegen MinIOs Port 9000. Es gibt dafuer auch kein Rewrite in `next.config.ts` (nur eines fuer
`/uploads/:path*`, ein anderer, separater Pfad). Ergebnis: jedes Bild/Audio im MediaTab (Grid +
Swipe-Modus) zeigte nichts, ausser vielleicht rein zufaellig auf einer Maschine, wo Frontend und
MinIO denselben Port teilen. `toProxyUrl` war nur in `MediaTab.tsx` importiert (verifiziert per
grep) — komplett entfernt statt nur angepasst, `<img>`/`<audio src>` brauchen fuer eine
Cross-Origin-URL kein Rewrite (das betrifft nur `fetch()`/CORS, nicht das reine Anzeigen).
**Nicht gebaut:** `app/(app)/matches/page.tsx` hat eine GLEICHNAMIGE, aber eigenstaendige
(nicht importierte) `toProxyUrl`-Funktion fuer `photo_url` — separater Code, nicht Teil dieses
Fixes, nicht geprueft (User-Anfrage war explizit "Admin-Tool").
Verifiziert: `tsc --noEmit` sauber; `eslint`-Vergleich vor/nach Fix zeigt exakt dieselben
6 Fehler/2 Warnungen (alle vorbestehend, keine neuen durch diese Aenderung). `curl` gegen die
echte MinIO-URL aus der DB (`http://localhost:9000/yourbrand-media/profiles/admin1.png`) ->
200 — die absolute URL ist direkt erreichbar, die relative (vorher) waere es nicht gewesen.

## 2026-09-17 — feat(auth): /forgot-password Seite gegen den 404 aus login/page.tsx
**Was:** `login/page.tsx` verlinkt `/forgot-password`, das es als Route nie gab (404 beim
Prefetch). Backend hat echte, funktionierende Endpoints dafuer
(`POST /auth/forgot-password`, `POST /auth/reset-password`, `auth.service.ts`), also Seite
angelegt statt Link zu entfernen — analog zu `login`/`register`/`verify`: E-Mail-Formular,
generische Erfolgsmeldung unabhaengig davon ob die Mail existiert (deckt sich mit dem
Backend-Verhalten, das aus demselben Grund nie verraet ob ein Account existiert).
**Nicht gebaut:** `/reset-password` (die Seite, die den Token aus der Mail entgegennimmt) —
war nicht Teil des Auftrags (nur `/forgot-password` war genannt). Gefunden, aber bewusst nicht
mitgefixt: `mail.service.ts`s `sendPasswordResetEmail` baut den Link aktuell als
`${APP_URL}/auth/reset-password?token=...` — mit `/auth`-Prefix, den es im Frontend-Routing gar
nicht gibt (`login`/`register`/`verify` liegen alle ohne Prefix direkt unter `/`). Der Link in der
tatsaechlich versendeten Mail waere also selbst mit einer angelegten `/reset-password`-Seite falsch
verdrahtet (`/auth/reset-password` statt `/reset-password`) — vorbestehender, separater Bug,
nicht Teil dieses Auftrags, hier nur dokumentiert.
Verifiziert: `tsc --noEmit` + `eslint` sauber, `npm run build` gruen (25 Routen, 0 Fehler),
`/forgot-password` erscheint als statische Route.

## 2026-09-17 — feat(legal): Impressum/Datenschutz/AGB ausfuehrlich + verifiziert
**Was:** `config/public.config.ts`s neue `LEGAL_INFO`-Konstante (`name`/`address`/`email`,
Platzhalter `<NAME>`/`<ANSCHRIFT>`/`<EMAIL>`) — die EINE Stelle fuer die eigenen Daten, ersetzt
die vorher komplett undefinierten `process.env.NEXT_PUBLIC_COMPANY_*`-Referenzen in Impressum/
Datenschutz (die Env-Vars existierten nirgends, waren also schon vorher immer `undefined`).
Neue `components/LegalPageNotice.tsx` (Demo-Hinweis + Rechtsberatungs-Disclaimer, auf allen 3
Seiten). `/agb` bekam echten Inhalt (war `[PLATZHALTER]`-Stub): Demo-Charakter, keine
Verfuegbarkeitsgarantie, kein Anspruch auf Datenerhalt, eigenes Risiko, keine kommerzielle
Nutzung, Verbot echter Drittdaten. `/agb`-Links in allen 3 Footern ergaenzt (auth/public/app-Layout
— app-Layout hardcoded "AGB" statt uebersetzt, konsistent mit den anderen beiden Footern, die
Impressum/Datenschutz dort auch nicht uebersetzen).
`/datenschutz` komplett neu, jede Aussage einzeln gegen den Code geprueft (siehe Backend-Build-Log
vom selben Tag fuer die Belege): Erhobene Daten (Registrierung/Profil/Chat/Consent/Zahlung),
Verschluesselung (bcrypt fuer Passwoerter, AES-256 fuer E-Mail, SHA-256 fuer Such-Hash/IP-Hash/
Token-Hash), Zugriffsschutz (RLS NUR auf `profile_sensitive_data`, sonst Anwendungs-Guards —
explizit so benannt, nicht als generelles RLS verkauft), Hosting-Kette (Vercel + privater Rechner
via ngrok), Speicherdauer (Full-Reset bei jedem Neustart, max. ca. 12h), keine Mail-Verifizierung,
Stripe im Testmodus, Betroffenenrechte inkl. der ehrlichen Nuance dass Soft-Delete/Pseudonymisierung
in der Praxis vom automatischen Full-Reset ueberholt wird.
**Nicht gebaut:** keine i18n-Uebersetzung der Rechtstexte (Aufgabe verlangte explizit Deutsch),
kein `t.footer.agb`-Key in allen 9 Sprachdateien (siehe oben, Konsistenz mit den zwei anderen
Footern reichte).
Verifiziert: `tsc --noEmit` + `eslint` sauber, `npm run build` komplett gruen (0 Fehler),
`/impressum`/`/datenschutz`/`/agb` erscheinen als statische Routen.

## 2026-09-17 — feat(register): Demo-Hinweis am E-Mail-Feld
**Was:** `app/(auth)/register/page.tsx` — kurzer Hinweistext direkt unter dem E-Mail-Input,
per `aria-describedby` verknuepft: keine echte/fremde Mail-Adresse verwenden, keine
Mail-Verifizierung aktiv, Daten werden bei Neustart geloescht. Minimal, keine Aenderung an
Formular-Logik/Validierung.
**Nicht gebaut:** —
Verifiziert: `tsc --noEmit` + `eslint` sauber.

## 2026-09-17 — feat(demo): fixierter Demo-Banner auf allen Seiten
**Was:** `components/DemoBanner.tsx`, in `app/layout.tsx` ganz oben (vor `ThemeInitializer`,
ausserhalb von `BackendHealthGate` — soll auch sichtbar bleiben, wenn das Backend offline ist)
eingehaengt, damit er wirklich auf jeder Seite steht, eingeloggt wie ausgeloggt.
`position: sticky top-0` (nicht `fixed`) — bleibt oben, ohne dass andere fixierte Elemente
(TopNav/DesktopSidebar) manuell um seine Hoehe verschoben werden muessten. Wegklick-Zustand in
`localStorage` (Key `xxx-demo-banner-dismissed`), Lesen/Schreiben je in try/catch — schlaegt das
fehl (privater Modus etc.), zeigt der Banner beim naechsten Aufruf einfach wieder, kein Crash.
Status als Text + `role="status"` + `aria-label`, nicht nur Farbe (Icon ist rein dekorativ,
`aria-hidden`). Link auf `/datenschutz`.
**Nicht gebaut:** kein neuer Zustand-Store fuer den Dismiss-Flag — lokaler `useState` reicht fuer
einen einzelnen Boolean. Dafuer ein inline `eslint-disable-next-line react-hooks/set-state-in-effect`
(gleiches Muster wie `useBootstrap.ts`s `exhaustive-deps`-Disable) — der Mount-Read aus
`localStorage` MUSS in einem Effect passieren, sonst kein Hydration-Match zwischen Server- und
Client-Render moeglich.
Verifiziert: `tsc --noEmit` + `eslint` beide sauber.

## 2026-09-17 — chore(branding): YourBrand -> YourDemo auf Anzeige-Ebene
**Was:** `grep -rl "YourBrand"` ueber `app`/`components`/`lib`/`config`/`hooks` lieferte 15 Treffer.
14 davon sind reine Anzeige-Strings umbenannt: `<title>` (`app/layout.tsx`), Logo/Wortmarke in
Header/Sidebar (`components/nav/HiddenShortcut.tsx`s `HiddenLogoButton`, tatsaechlich in
`TopNav.tsx`/`DesktopSidebar.tsx` gerendert), Auth-/Onboarding-Layout-Wortmarken, die B2B-
Marketingseite (`app/(public)/b2b/page.tsx`) und alle Marketing-/Willkommenstexte in den 9
Sprachdateien (`lib/i18n/*.ts`) + `config/translations.ts`.
**Nicht gebaut:** `hooks/useHiddenZone.ts`s `MASTER_KEY = 'YourBrand'` bewusst NICHT umbenannt —
das ist kein Anzeige-Text, sondern das Passwort, das `HiddenEntryOverlay.tsx` gegen die
Nutzereingabe prueft (`input === MASTER_KEY`), um die Hidden Zone freizuschalten. Umbenennen
waere eine Verhaltensaenderung (der bekannte Freischalt-Code wuerde nicht mehr funktionieren),
keine reine Anzeige-Aenderung — ausserhalb des Auftrags ("nur Anzeige-Ebene").
Verifiziert: `tsc --noEmit` sauber, kein `yourbrand`-Treffer (case-insensitive) mehr ausser der
bewusst ausgenommenen `MASTER_KEY`-Zeile.

## 2026-09-17 — fix(auth): kaputtes Cookie-Gate aus der Middleware entfernt
**Was:** Login lief backendseitig komplett durch (200, Cookie gesetzt, Logs zeigen Erfolg), aber
das Frontend blieb nach dem Login auf `/login` stehen — kein Fehler, kein Redirect. Ursache lag
NICHT bei Cookie-Flags (waren schon korrekt/konfigurierbar) oder `credentials`/CORS (beide schon
gesetzt), sondern in `proxy.ts` (Next 16s Middleware-Aequivalent, im Build als `ƒ Proxy
(Middleware)` gelistet): sie gatete `/dashboard`, `/consent` etc. ueber
`request.cookies.get('refreshToken')` — dieses Cookie wird aber vom Backend auf der ngrok-Domain
gesetzt (host-only, kein `Domain`-Attribut) und kann in einem Split-Domain-Deploy (Frontend auf
Vercel, Backend auf ngrok) STRUKTURELL NIE in einem Request an die Vercel-Domain auftauchen —
unabhaengig von `SameSite`/`Secure`. Jede Navigation zu einer geschuetzten Route nach erfolgreichem
Login wurde dadurch sofort wieder auf `/login` zurueckgeschickt. Datei komplett geloescht statt nur
die zwei Redirect-Zweige zu entkernen — ohne sie waere die Middleware ein reiner No-Op gewesen
(totes `PROTECTED_PREFIXES`/`AUTH_ROUTES`), und der Schutz laeuft bereits clientseitig:
`fetchApi()` (`lib/api.ts`) versucht bei 401 ein Refresh, scheitert das, ruft
`useAuthStore.logout()`, was hart auf `/login` umleitet — ueber den Access-Token
(Zustand/localStorage), nicht ueber ein Cookie, das serverseitig ueberhaupt sichtbar waere.
Zusaetzlich (Config, nicht Code): `backend/.env`s `COOKIE_SAMESITE` war gar nicht gesetzt (Default
`'lax'`) — fuer das cross-site `/auth/refresh` waere das Cookie sonst separat auch nicht
mitgeschickt worden. Auf `none` gesetzt, Backend neu gestartet.
**Nicht gebaut:** kein Ersatz-Cookie/-Mechanismus fuer serverseitigen Redirect-Schutz (das waere
ein Umbau am Auth-Flow) — das bestehende clientseitige Fallback reicht, nur etwas weniger instant
(kurzer Render der Seite, bevor der 401-Refresh-Fail redirectet) statt eines sofortigen
Server-Redirects. Betrifft lokal (same-site) wie cross-site gleich, keine Sonderfaelle.
Verifiziert: `npm run build` durchgelaufen (0 Fehler), `ƒ Proxy (Middleware)` erscheint nicht mehr
in der Route-Tabelle. Live-Login mit echten Zugangsdaten nicht getestet (keine Testdaten
verfuegbar, kein Erraten von Seed-User-Passwoertern) — Cookie-Flag-Logik per Codereview bestaetigt
(`sameSite: 'none'`, `secure: true` bei `COOKIE_SAMESITE=none`, war schon vor diesem Fix korrekt
implementiert, nur der Env-Wert fehlte).

## 2026-09-17 — fix(verify): useSearchParams in Suspense-Boundary gewrappt
**Was:** Gleiche Ursache wie beim `/login`-Fix eben (siehe Eintrag darunter), zweiter von genau
zwei Fundstellen (`grep -rln useSearchParams` ueber `app`/`components`/`hooks`/`lib` lieferte nur
diese beiden). Bei `/verify` haengt der komplette Seiteninhalt vom `token`-Query-Param ab, daher
wanderte hier die ganze bisherige `VerifyPage`-Logik unveraendert in eine neue `VerifyContent`-
Komponente; `VerifyPage` selbst ist jetzt nur noch `<Suspense fallback={<VerifyingFallback
/>}><VerifyContent /></Suspense>`. Der Fallback ist derselbe Loader2-Spinner-Block, den
`VerifyContent` intern sowieso schon fuer den `status === 'loading'`-Fall zeigt — eine Komponente,
zwei Verwendungen, kein neuer Baustein.
**Nicht gebaut:** ein vorbestehender, unabhaengiger ESLint-Fehler (`react-hooks/set-state-in-effect`
auf dem `setStatus('error')` im `!token`-Zweig) blieb unangetastet — schon vor diesem Fix da,
nicht Teil dieser Aufgabe (verifiziert per Diff gegen den Stand vor der Aenderung).
Verifiziert: `npm run build` laeuft komplett durch, `/verify` erscheint in der Route-Tabelle als
`○` (static prerendered), 0 Prerender-Fehler ueber alle 24 Routen.

## 2026-09-17 — fix(login): useSearchParams in Suspense-Boundary gewrappt
**Was:** `npm run build` brach beim Prerendern von `/login` ab (`useSearchParams() should be
wrapped in a suspense boundary`, siehe
https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout). `LoginPage` rief
`useSearchParams()` direkt auf, nur um das `?setup=done`-Banner zu zeigen — dieser Teil wanderte
in eine eigene Komponente `SetupDoneBanner`, eingewickelt in `<Suspense fallback={<SetupDoneFallback
/>}>`. `SetupDoneFallback` ist ein kleiner Spinner (`Loader2`, gleiche Bibliothek wie ueberall sonst
im Projekt), kein `null`. Rest der Login-Logik (Form-State, `handleSubmit`) unveraendert.
**Nicht gebaut:** keine `force-dynamic`-Umgehung — Suspense ist hier die Standardloesung und
funktioniert, weil nur ein kleiner, unabhaengiger Teil der Seite von den Query-Params abhaengt.
Verifiziert: `npm run build` laeuft komplett durch, `/login` erscheint in der Route-Tabelle als
`○` (static prerendered).

## 2026-09-15 — feat(offline): Fullscreen-Fallback wenn Backend nicht erreichbar
**Was:** `hooks/useBackendHealth.ts` pollt `<Origin von NEXT_PUBLIC_API_URL>/health` alle 30s
(4s-Timeout via `AbortController`, sendet `NGROK_HEADER`); Status `'checking' | 'healthy' |
'unhealthy'`. `components/OfflineFallback.tsx` zeigt Text (nie nur Farbe, `role="status"` +
`aria-label`) + statische Betriebszeiten + Primär-Button "Anfrage senden" (mailto mit
`NEXT_PUBLIC_CONTACT_EMAIL`, oder ein kleines POST-Formular wenn
`NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` gesetzt ist) + Link zu `NEXT_PUBLIC_DEMO_VIDEO_URL`.
`components/BackendHealthGate.tsx` (in `app/layout.tsx` um `{children}` gelegt) rendert den
Fallback nur bei `'unhealthy'` — der initiale `'checking'`-Zustand rendert die App normal weiter,
um keinen Flash bei schnellen Verbindungen zu zeigen.
**Nicht gebaut:** kein i18n fuer den Fallback-Text (App ist ohnehin primaer Deutsch, siehe
`app/layout.tsx`s Metadata), kein Retry-Button (die 30s-Poll-Schleife deckt das ab).
Verifikation: `tsc --noEmit` + `eslint` sauber; visuelle Browser-Pruefung (Fallback erscheint bei
`/health`-Fehlschlag, verschwindet bei Erfolg) **nicht** gemacht — keine Headless-Browser-Tooling
(Playwright/Puppeteer/Chromium) in dieser Umgebung verfuegbar, `curl` sieht nur den
serverseitig gerenderten Erstzustand (`'checking'`), nicht das clientseitige Poll-Ergebnis.

## 2026-09-15 — feat(api): NEXT_PUBLIC_WS_URL + zentraler ngrok-Header
**Was:** `lib/socket.ts`s `NEXT_PUBLIC_SOCKET_URL` umbenannt zu `NEXT_PUBLIC_WS_URL` (Vorgabe des
Demo-Hosting-Tasks, `.env` ist gitignored, betrifft nur den lokalen Dev-Wert). Neue Export-Konstante
`NGROK_HEADER` in `lib/api.ts`, in `buildHeaders()` (deckt `fetchApi()` + Retry) und in
`tryRefresh()` eingemischt; die drei Stellen mit eigenem, nicht ueber `fetchApi` laufendem
`fetch(...)` (`settings/page.tsx`s GDPR-Export, `onboarding/page.tsx`s Photo-Upload,
`lib/profanity.ts`s Wordlist-Fetch) importieren `NGROK_HEADER` und mischen ihn manuell ein. Beide
`io(...)`-Aufrufe in `lib/socket.ts` bekamen zusaetzlich `extraHeaders`. Grund: ngrok Free zeigt
ohne `ngrok-skip-browser-warning` eine HTML-Warnseite vor jedem GET/WS-Handshake.
**Nicht gebaut:** kein Umbau der 3 Fetch-Stellen auf `fetchApi()` selbst — sie haben eigene Gruende
dafuer (FormData/Blob-Handling, kein Auth-Retry noetig), nur der Header wurde ergaenzt. `next.config.ts`
(`images.remotePatterns`, `rewrites()`) unveraendert gelassen — bereits env-parametrisiert
(`BACKEND_INTERNAL_URL`), kein `next/image` im Code gefunden das die remotePatterns braucht.

## 2026-09-12 — delete: verwaiste ErrorCard-Komponente entfernt
**Was:** `components/ui/ErrorCard.tsx` war nirgends importiert (`grep -rn "ErrorCard" app components
lib hooks` → nur die eigene Definition). `app/error.tsx`/`global-error.tsx` nutzen eigenes inline
Markup statt dieser Komponente. Fund aus `backend/docs/audit.html` (2026-09-12).
**Nicht gebaut:** kein Ersatz, kein Einbau in die Error-Boundaries — falls die Komponente gebraucht
wird, war sie nie fertig verdrahtet und müsste neu bewertet werden.
