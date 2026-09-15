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
