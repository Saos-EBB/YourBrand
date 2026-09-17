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
