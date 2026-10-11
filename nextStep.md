# Shop-Modul — Stand und nächste Schritte

Branch: `feat/shop-module` · Stand: 2026-10-10

## Worum es geht

Mandanten-Modul `shop`: Der Mandant verkauft **Essen** (abholen/liefern), **Merch** (Versand),
**Lizenz-Keys** und **Freischalt-Codes** (in der App, z. B. `premium:30` / `coins:500`, oder für
etwas außerhalb). Bis ~1000 Artikel mit Filtern nach Preis, Bewertung, Kategorie und Art.

Kernidee: **Das System hält an, der Mensch entscheidet.**

```
Kunde bestellt (= Angebot) ─► Stripe reserviert nur (capture_method: manual)
  ─► Risiko-Check ─┬─ unauffällig ─► angenommen (= Vertrag) ─► abgebucht ─► ausgeliefert ─► Rechnung per Mail
                   └─ auffällig ──► ANGEHALTEN ─► Mensch: annehmen │ ablehnen (Begründung Pflicht, kein Geld fließt)
  Frist ohne Entscheidung ─► Reservierung verfällt, Kunde zahlt nichts
  Nach Auslieferung: Erstattung / Rückruf ─► Key/Code gesperrt ─► Stornorechnung
```

Entscheidungen bisher:
- **Phase 1:** Der Mandant verkauft. **Phase 2 (später):** Marktplatz, User verkaufen über Stripe
  Connect, der Mandant bekommt Prozente pro Transaktion. Die Felder (`seller_id`,
  `platform_fee_cents`) gibt es schon, sie bleiben vorerst leer.
- **Regelbesteuert:** 19 % / 7 % (Essen 7 %), nur deutsche Sätze (EU-OSS siehe offene Punkte).
- **Bewerten** dürfen nur Käufer.
- **Nur Online-Zahlung**, kein Bar bei Lieferung (No-Show = Annahmeverzug, Fall für einen Menschen).
- **Alarme:** App (Socket an Admins) + Mail. Telegram/SMS später über dieselbe Schnittstelle.
- **Versand:** Pauschale pro Bestellung (einstellbar).

## Was gemacht ist

Vorher auf `main` committet (offene Arbeit von davor, damit der Branch sauber startet):
`a45f345` Backend board/caretaker/orgs · `61f728d` Frontend · `9254e31` Tenants · `f3cce38` Doku.

Auf dem Branch:

| Commit | Inhalt |
|---|---|
| `75313a9` | Mandanten-Modul `shop`: in keinem Tier Standard; nur mit `payments` und `legal.vatId` (`DE` + 9 Ziffern) oder `legal.taxNumber`. Route `/shop`, Menüpunkt, Label in 9 Sprachen, Tests im Loader-Spec |
| `297456d` | Erste Fassung von Migration 007 + Seed (1000 Artikel) |
| `d29dc5e` | Migration 007 überarbeitet für den Bestell-Ablauf, Seed mit vier Artikelarten |

**`backend/migrations/007_shop.sql`**
- `shop_products`: Art (`food`/`physical`/`license`/`unlock`), `unlock_target`, Preis brutto in Cent, MwSt, Bestand, Bewertungsschnitt (per Trigger aktuell gehalten), Indizes für alle Filter + Trigram-Suche auf dem Titel
- `shop_reviews`: eine Bewertung pro Käufer und Artikel
- `shop_orders`: Status-Maschine, Lieferart, Pflichtangaben per CHECK (Liefern: Adresse + Telefon, Abholen: Name + Telefon, Versand: Adresse, digital: Widerrufs-Verzicht § 356 Abs. 5 BGB), Stripe-Felder (Payment Intent, Karten-Fingerabdruck, Radar), `hold_reasons`, `decide_by`, wer entschieden hat; Ablehnen nur mit Begründung
- `shop_order_items`: Kopie von Titel, Preis und MwSt zum Kaufzeitpunkt
- `shop_codes`: Keys/Codes verschlüsselt (`bytea`, `encryptField`), Suche über `code_hash`, zugeteilt, eingelöst, gesperrt (wer/wann)
- `shop_order_events`: Protokoll pro Bestellung, **nur anhängen** (Trigger blockt UPDATE/DELETE)
- `shop_cases` + `shop_case_messages`: Problem melden, Käufer melden, Support, Rückbuchung, „nicht angetroffen“; Dringlichkeit, Frist, interne Notizen
- `shop_user_blocks`: Shop-Sperre (nicht der ganze Account)
- `shop_invoice_counters` + `shop_invoices`: fortlaufende Nummern ohne Lücken, Rechnung + Stornorechnungen, PDF in der DB (Bucket ist public-read)
- `ticket_type` bekommt `shop`, damit Fälle im bestehenden Admin-Eingang auftauchen
- Bestellungen/Rechnungen hängen nicht per CASCADE am User (Aufbewahrung 10 Jahre)

**`backend/src/database/seeds/seed-shop.ts`**: 1000 Artikel in 6 Kategorien (Pizza, Bowls, Merch,
Software, In-App, Gutscheine), Bewertungen von den Demo-Usern, deterministisch und idempotent,
No-op ohne das Modul. Läuft über `docker-entrypoint.sh`. Lizenz-Artikel haben noch keine Keys
(die kommen über den Admin-Import), gelten also vorerst als ausverkauft.

## Testen

### Schon getestet
- `npx jest src/common/tenant` → 37/37 grün (inkl. neuer Shop-Regeln)
- Frontend `tsc --noEmit` im Container sauber
- Migration 001–007 in einem Wegwerf-Postgres (`xxx_db:local`): 007 zweimal hintereinander als ein Query (wie `tenant-init`) ohne Fehler
- CHECKs mit Gegenbeispielen: Liefern ohne Telefon, digital ohne Verzicht, Ablehnen ohne Begründung, `unlock_target` bei Essen → alle abgewiesen; Protokoll ändern/löschen → abgewiesen
- Seed zweimal → 1000 Artikel, keine Doppelten, Bewertungen breit verteilt
- Bekannt und nicht von uns: 2 TS-Fehler in `backend/src/modules/hidden/beef/games/rps.handler.spec.ts`

### Selbst testen (im echten Stack)
1. Shop bei einem Mandanten einschalten, z. B. `tenants/kiez/tenant.json`:
   ```json
   "modules": { "...": "...", "shop": true },
   "legal": { "...": "...", "vatId": "DE123456789" }
   ```
2. Mandant starten: `scripts/tenant.sh up kiez` → `init` spielt 007 automatisch ein, der Seed legt 1000 Artikel an.
   Die Haupt-DB (`default`) bekommt 007 nur bei neuem Volume oder von Hand:
   `docker exec -i XXX_db psql -U <user> -d <db> -c "SET search_path=public; $(cat backend/migrations/007_shop.sql)"`
3. Prüfen:
   ```bash
   scripts/tenant.sh smoke kiez
   # Mandanten-DBs liegen auf der geteilten Infra (XXX_db), Datenbank yb_<slug>
   docker exec XXX_db psql -U <user> -d yb_kiez -c "SELECT fulfillment, count(*) FROM shop_products GROUP BY 1"
   ```
   Im Frontend erscheint der Menüpunkt „Shop“ mit Liste, Filtern und Artikelseiten.
4. Gegenprobe: `"shop": true` ohne `vatId`/`taxNumber` oder mit `"payments": false` → Backend startet nicht, Fehler nennt den Grund.

### Noch zu testen (mit den nächsten Schritten)
- **Stripe-Formular im Frontend ungesehen:** `frontend/.env` braucht `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`), sonst zeigt die Kasse nur die Fehlermeldung
- **Stripe-Parameter des Checkouts ungeprüft:** `backend/.env` hat einen Platzhalter-Key (`Invalid API Key provided`). Geprüft ist nur der Fehlerpfad (Bestellung `cancelled`, `stripe_error`, 503). Mit echtem `sk_test_…` nochmal: Session mit `capture_method: manual` + `embedded_page` wird angenommen, Beträge/Metadaten stimmen
- Filter-API: Grenzwerte, Sortier-Whitelist, Pagination, Antwortzeit bei 1000 Artikeln
- Rechnungsnummern ohne Lücken bei parallelen Bestellungen
- Doppelte Stripe-Webhooks (Idempotenz), abgelaufene Reservierung, Teilerstattung
- Jede Risiko-Regel einzeln (Doppelbuchung, Häufigkeit, Betrag, Radar, Vorgeschichte)
- Stripe-Testmodus Ende-zu-Ende: Bestellung → angehalten → annehmen/ablehnen → Rechnung/Storno per Mail

## Nächste Schritte

1. ✅ Mandanten-Modul
2. ✅ Datenbank + Seed
3. ✅ **Artikel-API mit Filtern**: `GET /shop/products?q&category&fulfillment&minPrice&maxPrice&minRating&inStock&sort&page&limit` mit Facetten, Detail, Bewertungen (nur Käufer)
4. ✅ **Checkout**: `POST /shop/checkout` legt die Bestellung `pending` an (Preise aus der DB, Pflichtfelder je Lieferart, Bestand/freie Keys) und öffnet eine Stripe-Session mit Reservierung (`capture_method: manual`). Stripe-Fehler → Bestellung `cancelled` + `stripe_error` im Protokoll + 503. Eingangsbestätigung → Schritt 5 (rechtlich erst nach Zahlung, also im Webhook)
   - **Als Nächstes: Schritt 10 (Frontend) vorgezogen** — erst soll der Shop stehen und sich gut anfühlen, Zahlungstests danach
5. Risiko-Regeln, Anhalten, Protokoll, Stripe-Webhooks (Zahlung, Rückbuchung, Erstattung), Schwellen in `SystemSettingsService`
6. Admin-Konsole `/admin/shop`: Eingang, Zeitstrahl, annehmen/ablehnen/erstatten/sperren, Alarme (Socket + Mail), Nachfass-Cron
   - ✅ **Teil 1** Eingang mit Status-Chips und Frist, Detail mit Käufer-Vorgeschichte und Zeitstrahl, annehmen (capture) / ablehnen (cancel, Begründung Pflicht). Artikelpflege jetzt unter `/admin/shop/products`
   - Offen: erstatten, sperren, Alarme, Nachfass-Cron (brauchen Schritt 5)
7. Auslieferung: Keys zuteilen, Codes erzeugen + `/shop/redeem`, Versand-/Essens-Status
   - ✅ **7a** Keys zuteilen/Codes erzeugen bei der Annahme (vorher Prüfung: genug Keys, sonst kein Abbuchen), Lieferstand für Essen/Versand im Admin, Käufer: „Meine Bestellungen“ mit Fortschritt und Keys/Codes
   - ✅ **7b** `/shop/redeem` + „Jetzt einlösen“: Coins über die neue Vermittlung `ModuleBroker` (shared). Premium-Codes vorerst „bleibt gültig“ (Premium-Modell offen)
8. Rechnungen + Stornorechnungen (BullMQ-Worker wie GDPR-Export, pdfkit, Resend mit Anhang)
9. Fälle: Melden in beide Richtungen, Support, Nachrichtenverlauf
   - ✅ Käufer meldet Problem (Verlauf, Antworten), Team meldet Käufer (intern), „nicht angetroffen“ öffnet dringenden Fall, Admin-Tab „Fälle“. Offen: Alarme, Nachfass-Cron, Stripe-Disputes, Shop-Sperre
10. Frontend Käufer: Liste mit Filtern, Warenkorb, Checkout, Bestellungen, Problem melden
    - ✅ **10a** `/shop` (Filter in der URL, Filter-Sheet auf dem Handy, Kategorie-Kacheln) und `/shop/[id]` (Bewertungen, Formular für Käufer)
    - ✅ **10b** Warenkorb (eine Lieferart pro Bestellung), Kasse mit Feldern je Lieferart, Stripe eingebettet, Dankeseite; `GET /shop/settings` für die Versandpauschale
    - ✅ Bestellungen (mit 7a), Problem melden (mit 9)
11. ✅ **Admin-Pflege** `/admin/shop`: Artikel anlegen/bearbeiten mit Vorschau, aus-/einblenden, CSV-Import mit Probelauf (alles oder nichts), Keys verschlüsselt hinzufügen
12. Doku + Tests

## Offen / nicht gebaut
- **Regel: Feature-Module nur über `ModuleBroker`** (Wunsch des Users, damit Module pro Mandant sauber an/aus gehen). Shop ist umgestellt. Offen: `MatchingModule` → `PaymentModule` direkt
- **Premium per Code** (`premium:30`): `subscriptions` kennt nur monthly/yearly/lifetime — eigener Plan (Migration) oder anderes Modell, erst entscheiden
- **Seed:** Titel und `unlock_target` passen nicht immer zusammen („Coin-Paket“ mit `premium:30`)
- **Body-Limit 100 KB** (Express-Standard, `main.ts` setzt keins): CSV-Import auf 95 000 Zeichen, Keys auf 2000 pro Aufruf begrenzt. Für größere Dateien müsste das Limit in `main.ts` hoch — betrifft alle Module, daher erst abstimmen
- **Rechtstexte** prüfen lassen: AGB (Bestellung = Angebot, Annahme mit Auftragsbestätigung, Wartezeit bei Lieferung), Widerrufsbelehrung je Artikelart, Datenschutz (Telefon/Adresse, 10 Jahre Rechnungen)
- **EU-OSS:** digitale Leistungen an Privatkunden im EU-Ausland ab 10.000 €/Jahr mit dem Satz des Käuferlands — heute nur deutsche Sätze
- **Marktplatz (Phase 2):** Stripe Connect, Provision in %, Melden wirklich gegenseitig zwischen Usern, DAC7-Meldepflicht
- **Weitere Alarm-Kanäle** (Telegram/SMS)
