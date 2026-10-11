# ShopSession

Übergabe für die Arbeit am Shop-Modul, damit eine neue Session ohne Vorwissen weitermachen kann.
Plan, Schema und offene Punkte stehen in [`nextStep.md`](nextStep.md), diese Datei sagt nur, **wo wir
stehen und wie gearbeitet wird**.

## Stand (2026-10-11)

- **Branch:** `feat/shop-module`, zweigt von `main` ab (`f3cce38`).
- **Schritte 1–11 sind fertig.** Der Shop steht vom Stöbern bis zur Kasse. Admins entscheiden angehaltene Bestellungen unter `/admin/shop` und pflegen Artikel unter `/admin/shop/products`. **Zahlungstests kommen ganz am Schluss** (Wunsch des Users: „nur API anhängen“). Offen: 12 (Doku + Tests), dann Stripe-Keys und Zahlungstests. Bekannte Lücke: Bestand wird beim Annehmen nicht heruntergezählt.
- Gepusht ist alles bis `5a24df5`. Danach sind lokale Commits dazugekommen (siehe unten). Seit workmode an ist, wird **nicht gepusht**.

| Commit | Schritt |
|---|---|
| `75313a9` | 1: Mandanten-Modul `shop` (braucht `payments` und `legal.vatId` oder `legal.taxNumber`) |
| `297456d`, `d29dc5e` | 2: Migration `backend/migrations/007_shop.sql` und Seed `seed-shop.ts` (1000 Artikel) |
| `5a24df5` | `nextStep.md` |
| `abeb83e` | 3: `GET /shop/products` (Filter, Facetten), `GET /shop/products/:id`, `POST /shop/products/:id/reviews` (nur Käufer) |

Code: `backend/src/modules/core/shop/`, eingebunden über `FEATURE_MODULES` in `backend/src/app.module.ts`.

## Was entschieden ist

- **Module reden nur über `ModuleBroker`** (`backend/src/modules/shared/broker/`), nie direkt — damit Module pro Mandant an/aus gehen. Anbieter melden sich in `onModuleInit` an. Kernteile (auth, profile, notifications, system-settings) dürfen direkt genutzt werden.

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

## Testen

**Ein Befehl:** `scripts/shop_demo.sh up` → http://localhost:3901/shop, eingeloggt als Admin `gutz` (Admin-Konsole
`/admin/shop`). `scripts/shop_demo.sh down` stoppt alles, die Daten bleiben im Volume `shop_demo_pgdata`.

- Eigener Stack, getrennt von Haupt-Stack und Mandanten: Postgres `shop_demo_db` (:55432), Redis `shop_demo_redis`
  (:56379), Frontend `shop_demo_fe` (`next dev` :3911, eigene Volumes für `node_modules` und `.next`), Backend auf dem
  Host (:3900), Worker auf dem Host (Rechnungen, Log `.shop-demo/worker.log`), Auto-Login-Proxy (:3901, `scripts/shop-demo/autologin-proxy.js`). Container mit
  `--restart unless-stopped`; nach einem Neustart des Rechners braucht es nur nochmal `up` für Backend und Proxy.
- `up` ist idempotent: neue Migrationen werden nachgezogen (`shop_demo_migrations`), Seeds überspringen Vorhandenes.
  Seeds: `demo-seed.ts` (Demo-User), `seed-shop.ts` (1000 Artikel), `scripts/shop-demo/seed-orders.ts`
  (9 Bestellungen in allen Zuständen, Lizenz-Keys, ein offener Fall; Annahme über den echten `ShopFulfillmentService`).
- Mandant: `scripts/shop-demo/tenant.json` (`core` + `shop` + `hidden`), Zustand und Logs in `.shop-demo/` (gitignored).
- Frisch anfangen: `scripts/shop_demo.sh down && docker volume rm shop_demo_pgdata`.
- Stripe ist nicht angebunden (Platzhalter-Key): Kasse und „Annehmen“ zeigen den Fehlerweg. Angehaltene Bestellungen
  über der Frist bleiben deshalb angehalten (der Cron schreibt einmal `stripe_error`), Alarm-Mails scheitern am
  Resend-Platzhalter (steht als Warnung im Log `.shop-demo/backend.log`).
- In der Demo ist `gutz` Admin und Käufer zugleich — Team-Antworten in einem Fall erscheinen daher beim Käufer als „eigene“.
- **Unit-Tests:** `cd backend && npx jest src/modules/core/shop src/modules/shared src/common/tenant`
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json --incremental false`. Die Fehler in `rps.handler.spec.ts` gab es vorher schon.
- **Frontend-Typecheck/Lint:** `docker exec shop_demo_fe sh -c 'npx tsc --noEmit && npx eslint <pfade>'`
- Playwright liegt in `/home/silence/instantJobbot/node_modules/playwright`.

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
