# ShopSession

Übergabe für die Arbeit am Shop-Modul, damit eine neue Session ohne Vorwissen weitermachen kann.
Plan, Schema und offene Punkte stehen in [`nextStep.md`](nextStep.md), diese Datei sagt nur, **wo wir
stehen und wie gearbeitet wird**.

## Stand (2026-10-11)

- **Branch:** `feat/shop-module`, zweigt von `main` ab (`f3cce38`).
- **Schritte 1–4, 6 (Teil 1), 10a, 10b und 11 sind fertig.** Der Shop steht vom Stöbern bis zur Kasse. Admins entscheiden angehaltene Bestellungen unter `/admin/shop` und pflegen Artikel unter `/admin/shop/products`. **Zahlungstests kommen ganz am Schluss** (Wunsch des Users: „nur API anhängen“). Offen dazwischen: Schritt 5 (Webhook, Risiko-Regeln — ändert den Vertrag von `PaymentService`, vorher fragen), 6 Rest (erstatten, sperren, Alarme), 7 (Auslieferung), 8 (Rechnungen), 9 (Fälle).
- Gepusht ist alles bis `5a24df5`. Danach sind lokale Commits dazugekommen (siehe unten). Seit workmode an ist, wird **nicht gepusht**.

| Commit | Schritt |
|---|---|
| `75313a9` | 1: Mandanten-Modul `shop` (braucht `payments` und `legal.vatId` oder `legal.taxNumber`) |
| `297456d`, `d29dc5e` | 2: Migration `backend/migrations/007_shop.sql` und Seed `seed-shop.ts` (1000 Artikel) |
| `5a24df5` | `nextStep.md` |
| `abeb83e` | 3: `GET /shop/products` (Filter, Facetten), `GET /shop/products/:id`, `POST /shop/products/:id/reviews` (nur Käufer) |

Code: `backend/src/modules/core/shop/`, eingebunden über `FEATURE_MODULES` in `backend/src/app.module.ts`.

## Was entschieden ist

- **Der Mandant verkauft.** Den Marktplatz (User verkaufen, der Mandant bekommt Prozente pro Transaktion) gibt es erst in Phase 2. Die Felder sind schon da und bleiben leer.
- **Arten:** `food` (abholen/liefern), `physical` (Merch, Versandpauschale pro Bestellung), `license` (Key aus dem Vorrat), `unlock` (Code für die App wie `premium:30` oder `coins:500`, oder extern).
- **Das System hält an, ein Mensch entscheidet.** Stripe reserviert nur (`capture_method: manual`). Unauffällige Bestellungen nimmt das System an, auffällige werden `held`. Ablehnen, Erstatten und Sperren macht nur ein Mensch, mit Begründung. Läuft die Frist ab, wird die Reservierung aufgehoben und es fließt kein Geld.
- **Vertrag:** Die Bestellung ist ein Angebot. Die Eingangsbestätigung kommt sofort, der Vertrag entsteht erst mit der Annahme (Freigabe und Abbuchung).
- **Bezahlt wird nur online**, kein Bar bei Lieferung.
- **Regelbesteuert**, nur deutsche Steuersätze. **Bewerten** dürfen nur Käufer.
- **Alarme:** App (Socket-Raum `admin`, Event `ticket.new`) und Mail. Weitere Kanäle kommen später.

## Arbeitsweise

- **workmode ist an** (`.claude/workmode.state`, grünes Badge in der Statusline). Neue Session: einmal `/workmode` tippen.
  - Vor jedem Step eine Gate-Zeile „Nicht gebaut: …“
  - Ein Commit pro Step, Code und Doku zusammen
  - Kein Push, bei Fehlern stoppen
- **Doku pro Step:**
  - Neuer Eintrag oben in `backend/docs/build-log.md`
  - `backend/docs/architecture.md` nur bei Strukturänderungen
  - `backend/docs/errors.md`, wenn etwas mehrere Versuche gekostet hat
  - Fortschritt in `nextStep.md` abhaken
- **Commit-Ende:** die Attribution-Zeilen aus der Session (`Co-Authored-By` / `Claude-Session`).
- **Pushen:** nur, wenn ausdrücklich gewünscht, und nur den Branch. Kein Merge, kein PR, kein PR-Link.

## Testen wie bisher

Der Haupt-Stack (`XXX_db`) läuft nicht immer, und die Loadtest-DB bleibt unangetastet. Getestet wird in einem Wegwerf-Postgres aus dem Projekt-Image:

```bash
cd backend
docker run -d --rm --name shop_mig_test -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD=t -e POSTGRES_USER=t -e POSTGRES_DB=postgres \
  --entrypoint docker-entrypoint.sh xxx_db:local postgres
P="docker exec -i shop_mig_test psql -U t"
$P -d postgres -qc "CREATE DATABASE yb_shoptest"
for f in migrations/00[1-6]_*.sql; do $P -d yb_shoptest -q -v ON_ERROR_STOP=1 < $f >/dev/null; done
# 007 enthält $$ -> am Stück, wie tenant-init
docker exec shop_mig_test psql -U t -d yb_shoptest -v ON_ERROR_STOP=1 -q \
  -c "SET search_path=public; $(cat migrations/007_shop.sql)"
```

- **Demo-User:** 8 Einträge in `users` (`email_search_hash` = sha256-Hex) plus `profiles` mit `birthdate`. `profiles` hat Pflichtfelder.
- **Seed:** braucht eine Mandanten-Config mit `"modules": {"shop": true}` und `legal.vatId` unter einem eigenen `TENANT_DIR`:
  ```bash
  TENANT=shoptest TENANT_DIR=<dir>/tenants DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=t DB_PASSWORD=t \
    npx ts-node -r tsconfig-paths/register src/database/seeds/seed-shop.ts
  ```
- **Testscripts gegen die DB** gehören unter `backend/.claude/` (gitignored) und werden danach gelöscht. Im Scratchpad laufen sie nicht, siehe `backend/docs/errors.md`.
- **Unit-Tests:** `npx jest src/modules/core/shop src/common/tenant`
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json`. Die Fehler in `rps.handler.spec.ts` gab es vorher schon.
- **Frontend-Typecheck:** im Container `docker exec <frontend> sh -c 'cd /app && npx tsc --noEmit'`, sofern einer läuft.
- **Frontend anschauen:** Backend lokal auf :3900 (`ts-node src/main.ts` mit `TENANT=shoptest`, DB :55432, Redis-Wegwerf `shop_redis_test` auf :56379), Frontend als Container `shop_fe_test` (`next dev` :3901, Image + `node_modules`-Volume von `XXX_frontend`, `NEXT_PUBLIC_API_URL=http://localhost:3900/api/v1`, für die Kasse `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). Ohne Login: Proxy `autologin-proxy.js` (Scratchpad) auf :3901 vor `next dev` auf :3911, setzt in jede Seite den Login von `demo1` (in der Test-DB Admin). Sonst Login per selbst signiertem JWT (`JWT_SECRET` aus `backend/.env`) in `localStorage['xxx-auth']`; der Demo-User braucht `profiles.onboarding_completed = true`. Playwright liegt in `/home/silence/instantJobbot/node_modules/playwright`. Angehaltene Testbestellungen gibt es erst mit Schritt 5; bis dahin legt `seed-orders.sql` (Scratchpad) 8 Bestellungen in verschiedenen Status an, Annehmen scheitert dort am Platzhalter-Key (502), Ablehnen ohne Reservierung geht.
- **Danach aufräumen:** `docker stop shop_mig_test shop_redis_test shop_fe_test`, Backend-Prozess beenden

## Nächster Schritt: 4, Checkout

- `POST /shop/checkout { items, delivery_mode, contact…, withdrawalWaiver }`
  - Preise kommen aus der DB.
  - Pflichtfelder je Lieferart, wie die CHECKs in 007.
- Bestellung `pending` anlegen, dann eine Stripe Checkout Session:
  - `ui_mode: 'embedded_page'` wie im `PaymentService`
  - `payment_intent_data.capture_method: 'manual'`
  - `metadata: { kind: 'shop', orderId }`
- Eingangsbestätigung per Mail (§ 312i BGB, ausdrücklich noch keine Annahme).
- Der Webhook liegt im bestehenden `PaymentService.handleWebhook`. Für die Shop-Abzweigung muss ein Modulvertrag geändert werden, das vorher kurz abstimmen.
