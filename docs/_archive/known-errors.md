> **Archiviert 2026-09-11:** Root-`docs/`-Datei der ersten Projektphase, seit dem Split in
> Per-Package-Docs verwaist (letzter Eintrag: 2026-07-22, keine Verlinkung mehr im Repo).
> Nur zur Historie behalten.

# Known Errors & Solutions

Wiederkehrende Fehler mit Ursache und Fix. Neue Einträge oben anhängen.

---

## [FE] Console Error "Profil nicht gefunden" — at fetchApi (lib/api.ts:79)

**Wann:** App-Start (`useBootstrap` → `GET /profile/me`), meist wenn ein Test-Account während einer offenen Session gelöscht wurde.

**Ursache:** `JwtGuard` prüft nur Signatur + Ablauf des Access Tokens, nicht ob der User in der DB noch existiert. Wird der Account hart gelöscht (z.B. `delete-user.ts`), bleibt der Token bis zu 15 Min gültig — `/profile/me` liefert dann 404, weil `users`/`profiles`-Zeile weg ist. `useBootstrap` behandelte nur den 401-Fall ("Session expired") speziell, ein 404 landete unbehandelt in `console.error` und der Client blieb in einem halb-eingeloggten Zustand hängen.

**Fix:** `useBootstrap.ts` behandelt `'Profil nicht gefunden'` jetzt wie eine abgelaufene Session: `useAuthStore.getState().logout()` (Store leeren + Redirect auf `/login`).

---

## [BE] Endlos-401-Loop nach Login: chat/conversations, profile/me, auth/refresh

**Wann:** Nach Login (oder beim Öffnen einer geschützten Seite mit einem alten Browser-Cookie) feuern `GET /chat/conversations`, `GET /profile/me` und `POST /auth/refresh` im Sekundentakt 401, Access Token wird nie erneuert.

**Ursache:** `refreshToken`-Lookup in der DB ohne `is_revoked`-Filter zeigte: die Zeile existierte gar nicht (nicht mal revoked). Kein Rotation-Race, kein Expiry-Bug — der Browser hielt einen `refreshToken`-Cookie (`httpOnly`, 30 Tage `maxAge`), der von dieser Backend-Instanz nie ausgestellt wurde (z.B. Rest eines DB-Resets). `AuthController.refresh()` warf bei ungültigem Token, bevor `res.cookie(...)` erreicht wurde — der tote Cookie wurde also nie gelöscht und hat bei jedem weiteren Seitenaufruf denselben 401-Zyklus erneut ausgelöst. Frontend-seitig existierten Single-Flight-Refresh, Ausschluss von `/auth/refresh` aus der 401-Retry-Logik und Hard-Redirect-auf-Login bei Fehlschlag bereits (`frontend/lib/api.ts`, `authStore.ts`) — das war nicht die Fundstelle.

**Fix:** `AuthController.refresh()` löscht den Cookie im `catch`, wenn `authService.refresh()` wirft:
```ts
} catch (err) {
    res.clearCookie('refreshToken', { path: '/' });
    throw err;
}
```

---

## [FE] TypeError: Failed to fetch — useBootstrap

**Wann:** Frontend startet, sofort im Browser-Console.

**Stack:** `fetchApi → useBootstrap.useEffect`

**Ursache:** Backend (NestJS) läuft nicht oder ist noch nicht hochgefahren.
`useBootstrap` macht beim App-Start einen Fetch auf `/api/v1/...` und bekommt keine Antwort.

**Fix:**
```bash
cd backend
npm run start:dev
```
Dann Frontend neu laden. Tritt auch kurz auf wenn Backend noch bootet — einfach warten.

---

## [BE] QueryFailedError: column Conversation.deleted_at_a does not exist

**Wann:** Chat-Seite / WebSocket-Connect / Admin Dashboard schlägt mit 500 fehl.

**Ursache:** `conversations`-Tabelle hatte noch das alte `deleted_at` (single column). Entity und Service erwarten `deleted_at_a` + `deleted_at_b` (per-User Soft-Delete). Migration fehlte.

**Fix:** Migration 033 laufen lassen:
```bash
npx ts-node -r tsconfig-paths/register src/database/seeds/run-sql.ts migrations/033_conversations_deleted_at_per_user.sql
```
Migration migriert alten `deleted_at`-Wert nach `deleted_at_a` und droppt die alte Spalte.

---

## [Seed] new row for relation "media_uploads" violates check constraint "chk_media_file_url"

**Wann:** Demo-Seed mit `DEMO_MEDIA_PATH` auf lokalem Dev-System.

**Ursache:** `media_uploads.file_url` hat `CHECK (file_url ~ '^https://')`, aber `BACKEND_URL` ist lokal `http://localhost:3000`.

**Fix:** Seed handled das automatisch — droppt die Constraint vor dem Media-Insert und warnt danach.
Constraint ist aktuell **entfernt** (Stand: 2026-06-07).
Wiederherstellen (nur wenn alle Einträge https:// haben):
```sql
ALTER TABLE media_uploads
  ADD CONSTRAINT chk_media_file_url CHECK (file_url ~ '^https://');
```
