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
