# Shop-Modul

Mandanten-Modul `shop` (an in `tenant.json` unter `modules.shop`, braucht `payments` und `legal.vatId` oder
`legal.taxNumber`). Der Mandant verkauft **Essen** (abholen/liefern), **Merch** (Versand), **Lizenz-Keys** und
**Freischalt-Codes** (`coins:500` in der App oder für etwas außerhalb). Bis ~1000 Artikel mit Filtern.

Code: `src/modules/core/shop/`, Schema: `migrations/007_shop.sql`, Frontend: `app/(app)/shop`, `app/(app)/admin/shop`,
`components/shop/`. Fahrplan und Entscheidungen: `nextStep.md` im Repo-Root.

**Grundsatz: Das System hält an, ein Mensch entscheidet.** Stripe reserviert nur (`capture_method: manual`).
Unauffälliges nimmt das System an, Auffälliges wartet auf einen Menschen. Ablehnen, Erstatten und Sperren macht nur
ein Mensch, immer mit Begründung.

## Ablauf einer Bestellung

```
Kasse (POST /shop/checkout)                         pending      Preise aus der DB, Pflichtfelder je Lieferart
  └─ Stripe Embedded Checkout, nur reservieren
Webhook "reserviert" ─► Zahlungsdaten speichern      authorized   Radar, Karten-Fingerabdruck, Rechnungsadresse
  │                     Eingangsbestätigung an Käufer (§ 312i, noch keine Annahme)
  ├─ Regeln unauffällig ─► System bucht ab           approved     decided_by NULL
  └─ Regeln auffällig  ─► anhalten + Alarm           held         Gründe + Frist (Essen 30 Min., sonst 24 Std.)
        ├─ Mensch nimmt an ─► abbuchen                approved
        ├─ Mensch lehnt ab ─► Reservierung frei       rejected     Begründung Pflicht, Mail an Käufer
        └─ Frist abgelaufen ─► Reservierung frei      expired      Cron, Mail an Käufer
Annahme ─► Keys zuteilen, Codes erzeugen, Bestand abziehen, Rechnung (Worker)
  ├─ digital ─► sofort                                fulfilled
  └─ Essen/Versand ─► Lieferstand bis zugestellt      fulfilled
Erstattung (Admin oder Stripe-Dashboard) ─► Stornorechnung    partially_refunded / refunded
Kasse nie abgeschlossen ─►                            cancelled
```

Annehmen läuft für Mensch und System gleich (`ShopOrdersAdminService.decide`): Keys und Bestand prüfen → Stripe
capture (Idempotency-Key `shop-approve-<id>`) → in einer Transaktion Status (nur aus dem erwarteten Ausgangsstatus,
zwei Admins gleichzeitig → der zweite bekommt 409), Protokoll, Auslieferung → Rechnung einreihen. Scheitert Stripe,
bleibt der Status und `stripe_error` steht im Protokoll; das System hält dann an („Abbuchen fehlgeschlagen“).

Jede Änderung steht in `shop_order_events` (nur anhängen, ein Trigger blockt UPDATE/DELETE).

## Risiko-Regeln

`shop-risk.ts` (reine Funktion, Fakten aus `ShopRiskService`). Schwellen sind Systemeinstellungen:

| Grund | Regel | Einstellung (Standard) |
|---|---|---|
| `amount_high` | Betrag ab | `shop_hold_amount_cents` (15000) |
| `new_buyer` | erste Bestellung ab | `shop_hold_new_buyer_cents` (5000) |
| `velocity` | Bestellungen in der letzten Stunde ab | `shop_hold_orders_per_hour` (3) |
| `card_reuse` | Karte bei anderen Konten (30 Tage) ab | `shop_hold_card_accounts` (2) |
| `previous_dispute` | frühere Rückbuchung oder Meldung gegen den Käufer | — |
| `radar_elevated` / `radar_highest` | Stripe Radar | — |
| `amount_mismatch` | reservierter ≠ bestellter Betrag | — |
| `capture_failed` / `keys_missing` / `out_of_stock` / `system_error` | automatische Annahme gescheitert | — |

Entscheidungsfrist: `shop_decide_minutes_food` (30) für Abholen/Liefern, `shop_decide_minutes_other` (1440) sonst.
Versandpauschale: `shop_shipping_cents` (490).

## Module reden nur über den Broker

`src/modules/shared/broker/module-broker.ts`. Der Shop importiert weder Stripe noch das Zahlungs- oder Coin-Modul.

| Vertrag | Anbieter | Nutzer im Shop |
|---|---|---|
| `payments()`: `createReservedCheckout`, `capture`, `cancel`, `refund` | `StripePaymentGateway` (payment) | Kasse, Annahme, Ablehnen, Frist, Erstatten |
| `dispatchPaymentEvent(kind, event)` / `handlePaymentEvents('shop', …)` | `PaymentService.handleWebhook` übersetzt Stripe in neutrale `PaymentEvent`s (`payment-events.ts`) | `ShopPaymentEventsService` |
| `unlock('coins', …)` | `CoinUnlockProvider` (hidden) | Codes einlösen |
| `unlock('premium', …)` | `PremiumUnlockProvider` (payment) | Codes einlösen |

Ist ein Modul aus, ist niemand angemeldet: `ModuleUnavailableError` bzw. das Event wird ignoriert.

Zahlungs-Events (`metadata.kind = 'shop'`): `authorized`, `canceled` (Stripe hebt auf → `expired`; eigene Aufhebungen
sind schon abgelehnt/verfallen), `checkout_expired` (→ `cancelled`), `refunded` (Erstattungen aus dem Dashboard;
eigene erkennt das Protokoll an der Refund-ID), `dispute_opened`/`dispute_closed` (dringender interner Fall).
Stripe darf doppelt und in beliebiger Reihenfolge zustellen — jeder Zweig prüft den Status. Wirft der Empfänger,
antwortet der Webhook mit Fehler und Stripe stellt neu zu.

## Auslieferung

- **Keys** (`license`): aus dem Vorrat (`shop_codes`, verschlüsselt, Suche über `code_hash`), Zuteilung mit
  `FOR UPDATE SKIP LOCKED`. Vorher wird geprüft, ob genug da sind, sonst wird gar nicht erst abgebucht.
- **Codes** (`unlock`): `XXXX-XXXX-XXXX`, 60 Bit, ohne 0/O/1/I. Einlösen unter `/shop/redeem`: Code erst für sich
  reservieren, dann über den Broker gutschreiben; scheitert die Gutschrift, wird die Reservierung zurückgenommen.
  `premium:<Tage>` schaltet Premium direkt frei (`PremiumUnlockProvider`, payment): eine Zeile in `subscriptions` mit
  plan `code`, Anbieter `shop`, Ablauf nach den Tagen. Weitere Codes verlängern ab dem letzten Ablauf. Migration `008_premium_codes.sql`.
- **Bestand** (`food`/`physical`, NULL = unbegrenzt): Prüfung vor dem Abbuchen, Abzug in der Annahme, nie unter 0,
  Engpass → `stock_short` im Protokoll.
- **Lieferstand**: Abholen `accepted → preparing → ready → delivered`, Liefern `… → on_the_way → delivered`,
  Versand `accepted → shipped (Sendungsnummer) → delivered`. „Nicht angetroffen“ ab fertig/unterwegs öffnet einen
  dringenden Fall.

## Erstatten, Sperren, Fälle

- **Erstatten** (`POST admin/shop/orders/:id/refund`): ganz oder teilweise, Zeilensperre über den Stripe-Aufruf,
  Idempotency-Key hängt am Stand vorher. Voll → offene Keys/Codes gesperrt, teilweise nur auf Wunsch.
- **Shop-Sperre** (`PUT/DELETE admin/shop/blocks/:userId`): 7/30 Tage/unbefristet, nur der Shop, nicht das Konto.
  Die Kasse prüft sie.
- **Fälle** (`shop_cases`): Käufer meldet ein Problem und schreibt mit dem Team (öffentlich oder interne Notiz);
  Team meldet einen Käufer; „nicht angetroffen“ und Rückbuchungen öffnen selbst einen Fall. Meldungen gegen Käufer
  und Rückbuchungen sind nur intern. Fristen: Problem 24 Std., Meldung 72 Std., nicht angetroffen 2 Std.,
  Rückbuchung 48 Std.

## Alarme und Nachfass-Cron

`ShopAlertService.send(kind)`: Socket-Event `shop.alert` an den Raum `admin` (ChatGateway), dazu Mail an alle
Admins/Owner bei Dringendem (`not_met`, `decide_soon`, `case_overdue`, `order_held`, `dispute`). Mails enthalten nur
Nummer und Link. Zähler: `GET admin/shop/attention` (Admin-Badge, Tabs).

`ShopFollowUpService` (jede Minute): hängende Reservierungen (5 Min.) anhalten, 30 Min. vor der Frist erinnern
(einmal), nach der Frist Reservierung aufheben, Fälle über der Frist erneut melden (dringend alle 30 Min., sonst 4 Std.).

## Rechnungen

Bei der Annahme eine Rechnung, je Erstattung eine Stornorechnung. API reiht Jobs in `shop-invoice` ein,
`ShopInvoiceProcessor` (nur im Worker) vergibt Nummer, rendert das PDF (§ 14 UStG, pdfkit) und schreibt die Zeile in
**einer** Transaktion — fortlaufend pro Jahr ohne Lücken (`RE-2026-000001`, Stornos `ST-…` im selben Zähler). Danach
Mail mit Anhang; scheitert sie, wiederholt BullMQ, und „Rechnung erneut senden“ im Admin hilft. MwSt je Satz aus
brutto, Versand und Stornos anteilig (`shop-invoice.ts`). PDFs liegen in der DB, nicht im Bucket (der ist public-read).

## Endpunkte

Käufer (`/shop`, eingeloggt): `GET settings`, `GET products`, `GET products/:id`, `POST products/:id/reviews`
(nur Käufer), `POST checkout`, `GET orders`, `GET orders/:id`, `GET orders/:id/invoices`, `GET invoices/:id/pdf`,
`POST redeem`, `GET`/`POST orders/:id/cases`, `POST cases/:id/messages`.

Admin (`/admin/shop`, Admin/Owner): `GET attention`, `GET`/`POST products`, `POST products/import`,
`PATCH products/:id`, `POST products/:id/codes`, `GET orders`, `GET orders/:id`, `POST orders/:id/approve|reject|
progress|refund|invoices|report`, `GET invoices/:id/pdf`, `PUT`/`DELETE blocks/:userId`, `GET cases`,
`GET cases/:id`, `POST cases/:id/messages|resolve`.

Webhook: `POST /payment/webhook` (Stripe-Signatur, Raw Body).

## Ausprobieren und testen

- **Demo:** `scripts/shop_demo.sh up` → http://localhost:3901/shop, eingeloggt als Admin `gutz`; `down` stoppt.
  Eigener Stack (Postgres, Redis, Frontend, Backend, Worker), Stripe und Resend nur mit Platzhalter-Keys.
- **Unit-Tests:** `npx jest src/modules/core/shop src/modules/shared src/modules/core/payment`. `@nestjs/bullmq`
  (ESM) ist in Unit-Tests per `moduleNameMapper` auf `test/stubs/nestjs-bullmq.ts` umgelenkt.
- **Integrationstest:** `scripts/shop_test.sh` — frische DB `yb_shoptest` im Demo-Container mit allen Migrationen,
  dann `shop.integration.spec.ts`: der ganze Weg mit echten Services und echtem SQL (Kasse, Regeln, automatische und
  menschliche Annahme, Keys/Codes/Bestand, Lieferstand, Erstattung im Admin und im Dashboard, Rechnungsnummern,
  Rückbuchung, Frist, abgebrochene Kasse). Ersetzt sind nur Stripe, Mail, Socket und Queue. Ohne `SHOP_IT_DB` wird
  er übersprungen.
- **Offen:** Tests mit echten Stripe-Keys (Testmodus + Stripe CLI für Webhooks) — kommen ganz am Schluss.
