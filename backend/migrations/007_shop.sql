-- 007_shop.sql
-- Mandanten-Modul "shop" (tenant.json "modules"): der Mandant verkauft
-- Essen (abholen/liefern), Merch (Versand), Lizenz-Keys und Freischalt-Codes.
--
-- Ablauf: Bestellung = Angebot des Kunden. Stripe reserviert nur
-- (capture_method manual). Unauffaellige Bestellungen nimmt das System an,
-- auffaellige haelt es an ('held') — annehmen, ablehnen, erstatten und
-- sperren entscheidet dann ein Mensch, mit Begruendung. Erst mit der Annahme
-- wird abgebucht, ausgeliefert und die Rechnung geschrieben.
--
-- seller_id / platform_fee_cents sind fuer den spaeteren Marktplatz (User
-- verkaufen, der Mandant bekommt Prozente). Heute NULL bzw. 0 — NULL heisst:
-- der Mandant selbst verkauft.
--
-- Rechnungen muessen 10 Jahre aufbewahrt werden (§ 147 AO): Bestellungen und
-- Rechnungen haengen nicht per CASCADE am User, Kaeufer- und Verkaeuferdaten
-- werden beim Kauf kopiert.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE), wie 002-006. Enthaelt
-- $$-Funktionen, laeuft in tenant-init daher am Stueck.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Shop-Faelle und gehaltene Bestellungen erscheinen auch im bestehenden
-- Admin-Eingang (admin_tickets, Socket-Event ticket.new)
ALTER TYPE public.ticket_type ADD VALUE IF NOT EXISTS 'shop';

CREATE TABLE IF NOT EXISTS public.shop_products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    seller_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    sku character varying(40) NOT NULL UNIQUE,
    title character varying(120) NOT NULL,
    description text NOT NULL DEFAULT '',
    category character varying(40) NOT NULL,
    -- food: abholen/liefern, physical: Versand, license: Key aus dem Vorrat
    -- (shop_codes), unlock: erzeugter Code
    fulfillment character varying(10) NOT NULL,
    -- unlock: was der Code in der App freischaltet ('premium:30', 'coins:500');
    -- NULL = Code fuer etwas ausserhalb, wird nur angezeigt
    unlock_target character varying(60),
    -- Bruttopreis in Cent (B2C), MwSt-Satz in Prozent
    price_cents integer NOT NULL,
    vat_rate numeric(4,2) NOT NULL DEFAULT 19.00,
    -- NULL = unbegrenzt; license zaehlt freie Keys statt stock
    stock integer,
    image_url text,
    rating_avg numeric(2,1) NOT NULL DEFAULT 0,
    rating_count integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_shop_fulfillment CHECK (fulfillment IN ('food', 'physical', 'license', 'unlock')),
    CONSTRAINT chk_shop_unlock_target CHECK (unlock_target IS NULL OR fulfillment = 'unlock'),
    CONSTRAINT chk_shop_price CHECK (price_cents > 0),
    CONSTRAINT chk_shop_vat CHECK (vat_rate IN (0, 7, 19)),
    CONSTRAINT chk_shop_stock CHECK (stock IS NULL OR stock >= 0),
    CONSTRAINT chk_shop_title_length CHECK (length(trim(title)) >= 2)
);
-- Filter und Sortierung der Artikelliste (nur aktive Artikel)
CREATE INDEX IF NOT EXISTS idx_shop_products_price ON public.shop_products (price_cents) WHERE active;
CREATE INDEX IF NOT EXISTS idx_shop_products_rating ON public.shop_products (rating_avg DESC) WHERE active;
CREATE INDEX IF NOT EXISTS idx_shop_products_category ON public.shop_products (category) WHERE active;
CREATE INDEX IF NOT EXISTS idx_shop_products_fulfillment ON public.shop_products (fulfillment) WHERE active;
CREATE INDEX IF NOT EXISTS idx_shop_products_created ON public.shop_products (created_at DESC) WHERE active;
CREATE INDEX IF NOT EXISTS idx_shop_products_title_trgm ON public.shop_products USING gin (title public.gin_trgm_ops);

-- Bewerten duerfen nur Kaeufer (geprueft im ShopService), eine pro Artikel
CREATE TABLE IF NOT EXISTS public.shop_reviews (
    product_id uuid NOT NULL REFERENCES public.shop_products(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rating smallint NOT NULL,
    body character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (product_id, user_id),
    CONSTRAINT chk_shop_rating CHECK (rating BETWEEN 1 AND 5)
);

-- rating_avg / rating_count mitfuehren, damit Filter und Sortierung nach
-- Bewertung ueber den Index laufen statt ueber ein Aggregat pro Anfrage
CREATE OR REPLACE FUNCTION public.shop_refresh_rating() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    pid uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
    UPDATE public.shop_products p
       SET rating_avg = COALESCE((SELECT round(avg(r.rating), 1) FROM public.shop_reviews r WHERE r.product_id = pid), 0),
           rating_count = (SELECT count(*) FROM public.shop_reviews r WHERE r.product_id = pid)
     WHERE p.id = pid;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_reviews_rating ON public.shop_reviews;
CREATE TRIGGER trg_shop_reviews_rating
    AFTER INSERT OR UPDATE OF rating OR DELETE ON public.shop_reviews
    FOR EACH ROW EXECUTE FUNCTION public.shop_refresh_rating();

-- Status:
--   pending      Checkout offen, noch nichts reserviert
--   authorized   Geld reserviert, Risiko-Check laeuft (Sekunden)
--   held         Risiko-Check hat angehalten, wartet auf einen Menschen
--   approved     angenommen (= Vertrag), abgebucht, Auslieferung laeuft
--   fulfilled    ausgeliefert (Key/Code zugeteilt, versendet, Essen uebergeben)
--   rejected     von einem Menschen abgelehnt, Reservierung aufgehoben
--   expired      Frist ohne Entscheidung abgelaufen, Reservierung aufgehoben
--   cancelled    Checkout abgebrochen / Zahlung fehlgeschlagen
--   refunded / partially_refunded   nach Annahme (ganz/teilweise) erstattet
CREATE TABLE IF NOT EXISTS public.shop_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    status character varying(20) NOT NULL DEFAULT 'pending',
    -- pickup/delivery: Essen, shipping: Merch, digital: Keys/Codes
    delivery_mode character varying(10) NOT NULL,
    -- Fortschritt bei Essen/Versand, fuer Kunde und Kueche
    progress character varying(12),
    items_cents integer NOT NULL,
    shipping_cents integer NOT NULL DEFAULT 0,
    total_cents integer NOT NULL,
    refunded_cents integer NOT NULL DEFAULT 0,
    platform_fee_cents integer NOT NULL DEFAULT 0,
    currency character(3) NOT NULL DEFAULT 'EUR',
    -- Pflichtangaben je nach delivery_mode, vor dem Bestellen erfasst
    contact_name character varying(200),
    contact_phone character varying(40),
    delivery_address text,
    desired_at timestamp with time zone,
    delivery_note character varying(300),
    tracking_number character varying(80),
    -- Digitale Inhalte: Zustimmung zur sofortigen Ausfuehrung und Kenntnis
    -- vom Erloeschen des Widerrufsrechts (§ 356 Abs. 5 BGB)
    withdrawal_waiver_at timestamp with time zone,
    -- Stripe
    stripe_session_id character varying(255) UNIQUE,
    stripe_payment_intent_id character varying(255) UNIQUE,
    card_fingerprint character varying(64),
    radar_risk character varying(12),
    -- Aus der Stripe-Session, fuer die Rechnung
    buyer_email character varying(255),
    buyer_name character varying(200),
    buyer_address text,
    -- Warum angehalten (Regel-Codes), bis wann jemand entscheiden muss
    hold_reasons text[] NOT NULL DEFAULT '{}',
    decide_by timestamp with time zone,
    -- Wer angenommen/abgelehnt hat; NULL bei decided_at = das System (nur Annahme)
    decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at timestamp with time zone,
    decision_note character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    authorized_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    CONSTRAINT chk_shop_order_status CHECK (status IN (
        'pending', 'authorized', 'held', 'approved', 'fulfilled',
        'rejected', 'expired', 'cancelled', 'refunded', 'partially_refunded')),
    CONSTRAINT chk_shop_delivery_mode CHECK (delivery_mode IN ('pickup', 'delivery', 'shipping', 'digital')),
    CONSTRAINT chk_shop_progress CHECK (progress IS NULL OR progress IN (
        'accepted', 'preparing', 'ready', 'on_the_way', 'shipped', 'delivered', 'not_met')),
    CONSTRAINT chk_shop_order_total CHECK (total_cents = items_cents + shipping_cents AND total_cents > 0),
    CONSTRAINT chk_shop_order_refund CHECK (refunded_cents BETWEEN 0 AND total_cents),
    -- Ein Mensch, der ablehnt, muss begruenden
    CONSTRAINT chk_shop_reject_reason CHECK (status <> 'rejected' OR (decided_by IS NOT NULL AND decision_note IS NOT NULL)),
    CONSTRAINT chk_shop_contact CHECK (
        (delivery_mode <> 'delivery' OR (delivery_address IS NOT NULL AND contact_phone IS NOT NULL))
        AND (delivery_mode <> 'pickup' OR (contact_name IS NOT NULL AND contact_phone IS NOT NULL))
        AND (delivery_mode <> 'shipping' OR delivery_address IS NOT NULL)
        AND (delivery_mode <> 'digital' OR withdrawal_waiver_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON public.shop_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON public.shop_orders (status, created_at DESC);
-- Nachfass-Cron: was wartet auf einen Menschen und laeuft bald ab
CREATE INDEX IF NOT EXISTS idx_shop_orders_held ON public.shop_orders (decide_by) WHERE status = 'held';
-- Risiko-Regeln: gleiche Karte in kurzer Zeit
CREATE INDEX IF NOT EXISTS idx_shop_orders_card ON public.shop_orders (card_fingerprint, created_at DESC) WHERE card_fingerprint IS NOT NULL;

-- Titel, Preis und MwSt-Satz zum Kaufzeitpunkt — spaetere Aenderungen am
-- Artikel aendern keine Rechnung
CREATE TABLE IF NOT EXISTS public.shop_order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.shop_products(id) ON DELETE SET NULL,
    seller_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    sku character varying(40) NOT NULL,
    title character varying(120) NOT NULL,
    fulfillment character varying(10) NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    vat_rate numeric(4,2) NOT NULL,
    platform_fee_cents integer NOT NULL DEFAULT 0,
    CONSTRAINT chk_shop_item_quantity CHECK (quantity BETWEEN 1 AND 99)
);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_order ON public.shop_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_product ON public.shop_order_items (product_id);

-- Lizenz-Keys (vom Admin importiert) und Freischalt-Codes (vom System
-- erzeugt). Klartext nur verschluesselt (encryptField), Suche beim
-- Einloesen ueber code_hash.
CREATE TABLE IF NOT EXISTS public.shop_codes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.shop_products(id) ON DELETE RESTRICT,
    code_encrypted bytea NOT NULL,
    code_hash character varying(64) NOT NULL UNIQUE,
    order_item_id uuid REFERENCES public.shop_order_items(id) ON DELETE SET NULL,
    assigned_at timestamp with time zone,
    redeemed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    redeemed_at timestamp with time zone,
    -- Rueckruf: Code gilt nicht mehr (Erstattung, Betrug)
    revoked_at timestamp with time zone,
    revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_shop_code_assigned CHECK (order_item_id IS NULL OR assigned_at IS NOT NULL)
);
-- Freie Keys pro Artikel (naechsten zuteilen, Bestand zaehlen)
CREATE INDEX IF NOT EXISTS idx_shop_codes_free ON public.shop_codes (product_id, created_at) WHERE assigned_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shop_codes_item ON public.shop_codes (order_item_id);

-- Protokoll pro Bestellung: Zahlung, Regel-Treffer, Entscheidungen,
-- Auslieferung, Erstattung. Nur anhaengen — UPDATE/DELETE blockt der
-- Trigger, damit nachvollziehbar bleibt, wer wann was entschieden hat.
-- actor_id NULL = System bzw. Stripe.
CREATE TABLE IF NOT EXISTS public.shop_order_events (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE RESTRICT,
    actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    type character varying(30) NOT NULL,
    data jsonb NOT NULL DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_order_events_order ON public.shop_order_events (order_id, id);

CREATE OR REPLACE FUNCTION public.shop_events_append_only() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    -- ON DELETE SET NULL von users darf actor_id leeren, sonst nichts
    IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
       AND NEW.order_id = OLD.order_id AND NEW.type = OLD.type AND NEW.data = OLD.data
       AND NEW.created_at = OLD.created_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'shop_order_events ist nur zum Anhaengen';
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_order_events_append_only ON public.shop_order_events;
CREATE TRIGGER trg_shop_order_events_append_only
    BEFORE UPDATE OR DELETE ON public.shop_order_events
    FOR EACH ROW EXECUTE FUNCTION public.shop_events_append_only();

-- Faelle: Problem melden (Kaeufer), Kaeufer melden (Verkaeufer/Team),
-- Support, Rueckbuchung (Stripe-Dispute). against_user_id/seller_id machen
-- das Melden beim Marktplatz gegenseitig.
CREATE TABLE IF NOT EXISTS public.shop_cases (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    order_id uuid REFERENCES public.shop_orders(id) ON DELETE RESTRICT,
    opened_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    against_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    seller_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    kind character varying(10) NOT NULL,
    reason character varying(30) NOT NULL,
    status character varying(10) NOT NULL DEFAULT 'open',
    priority character varying(10) NOT NULL DEFAULT 'normal',
    -- bis wann jemand reagieren muss; der Nachfass-Cron meldet sich erneut
    due_at timestamp with time zone NOT NULL,
    last_alert_at timestamp with time zone,
    assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
    admin_ticket_id uuid,
    stripe_dispute_id character varying(255) UNIQUE,
    resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at timestamp with time zone,
    resolution character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_shop_case_kind CHECK (kind IN ('problem', 'report', 'support', 'dispute', 'not_met')),
    CONSTRAINT chk_shop_case_status CHECK (status IN ('open', 'waiting', 'resolved')),
    CONSTRAINT chk_shop_case_priority CHECK (priority IN ('urgent', 'high', 'normal')),
    CONSTRAINT chk_shop_case_resolved CHECK (status <> 'resolved' OR (resolved_at IS NOT NULL AND resolution IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_shop_cases_open ON public.shop_cases (due_at) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS idx_shop_cases_order ON public.shop_cases (order_id);
CREATE INDEX IF NOT EXISTS idx_shop_cases_opened_by ON public.shop_cases (opened_by, created_at DESC);

-- internal: Notiz nur fuers Team, der Kaeufer sieht sie nicht
CREATE TABLE IF NOT EXISTS public.shop_case_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    case_id uuid NOT NULL REFERENCES public.shop_cases(id) ON DELETE CASCADE,
    author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    body character varying(2000) NOT NULL,
    internal boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_case_messages_case ON public.shop_case_messages (case_id, created_at);

-- Shop-Sperre (nur der Shop, nicht der ganze Account) — setzt ein Mensch
CREATE TABLE IF NOT EXISTS public.shop_user_blocks (
    user_id uuid NOT NULL PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    reason character varying(1000) NOT NULL,
    blocked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    until timestamp with time zone
);

-- Fortlaufende Rechnungsnummern pro Jahr ohne Luecken (Sequenzen koennen
-- Luecken haben). Vergeben per UPDATE ... RETURNING in der Transaktion, die
-- auch die Rechnung schreibt. Gilt fuer Rechnungen und Stornorechnungen.
CREATE TABLE IF NOT EXISTS public.shop_invoice_counters (
    year integer NOT NULL PRIMARY KEY,
    last_no integer NOT NULL DEFAULT 0
);

-- PDF in der DB, nicht im Object Storage: der Bucket ist public-read
-- (siehe MailService.sendGdprExportEmail). Eine Rechnung pro Bestellung,
-- Erstattungen bekommen je eine Stornorechnung (credit_note) mit Verweis.
CREATE TABLE IF NOT EXISTS public.shop_invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE RESTRICT,
    kind character varying(12) NOT NULL DEFAULT 'invoice',
    corrects_invoice_id uuid REFERENCES public.shop_invoices(id) ON DELETE RESTRICT,
    invoice_number character varying(20) NOT NULL UNIQUE,
    amount_cents integer NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    -- Verkaeufer zum Rechnungszeitpunkt (tenant.json legal)
    seller jsonb NOT NULL,
    pdf bytea NOT NULL,
    -- Stripe-Refund, zu dem die Stornorechnung gehoert (Idempotenz)
    stripe_refund_id character varying(255) UNIQUE,
    sent_at timestamp with time zone,
    CONSTRAINT chk_shop_invoice_kind CHECK (kind IN ('invoice', 'credit_note')),
    CONSTRAINT chk_shop_credit_note_ref CHECK ((kind = 'credit_note') = (corrects_invoice_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_invoices_order ON public.shop_invoices (order_id) WHERE kind = 'invoice';
