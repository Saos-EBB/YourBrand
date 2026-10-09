-- 007_shop.sql
-- Mandanten-Modul "shop" (tenant.json "modules"): der Mandant verkauft
-- digitale Artikel, bezahlt wird ueber Stripe Checkout, danach geht eine
-- Rechnung (§ 14 UStG) als PDF per Mail raus.
--
-- seller_id / platform_fee_cents sind fuer den spaeteren Marktplatz (User
-- verkaufen, der Mandant bekommt eine Provision). Heute immer NULL bzw. 0 —
-- NULL heisst: der Mandant selbst verkauft.
--
-- Rechnungen muessen 10 Jahre aufbewahrt werden (§ 147 AO): Bestellungen und
-- Rechnungen haengen nicht per CASCADE am User, Kaeufer- und Verkaeuferdaten
-- werden beim Kauf kopiert.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE), wie 002-006. Enthaelt
-- $$-Funktionen, laeuft in tenant-init daher am Stueck.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.shop_products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    seller_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    sku character varying(40) NOT NULL UNIQUE,
    title character varying(120) NOT NULL,
    description text NOT NULL DEFAULT '',
    category character varying(40) NOT NULL,
    -- Bruttopreis in Cent (B2C), MwSt-Satz in Prozent
    price_cents integer NOT NULL,
    vat_rate numeric(4,2) NOT NULL DEFAULT 19.00,
    image_url text,
    rating_avg numeric(2,1) NOT NULL DEFAULT 0,
    rating_count integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_shop_price CHECK (price_cents > 0),
    CONSTRAINT chk_shop_vat CHECK (vat_rate IN (0, 7, 19)),
    CONSTRAINT chk_shop_title_length CHECK (length(trim(title)) >= 2)
);
-- Filter und Sortierung der Artikelliste (nur aktive Artikel)
CREATE INDEX IF NOT EXISTS idx_shop_products_price ON public.shop_products (price_cents) WHERE active;
CREATE INDEX IF NOT EXISTS idx_shop_products_rating ON public.shop_products (rating_avg DESC) WHERE active;
CREATE INDEX IF NOT EXISTS idx_shop_products_category ON public.shop_products (category) WHERE active;
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

CREATE TABLE IF NOT EXISTS public.shop_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    status character varying(10) NOT NULL DEFAULT 'pending',
    total_cents integer NOT NULL,
    currency character(3) NOT NULL DEFAULT 'EUR',
    stripe_session_id character varying(255) UNIQUE,
    -- Digitale Inhalte: Zustimmung zur sofortigen Ausfuehrung und Kenntnis
    -- vom Erloeschen des Widerrufsrechts (§ 356 Abs. 5 BGB)
    withdrawal_waiver_at timestamp with time zone NOT NULL,
    -- Aus der Stripe-Session, fuer die Rechnung
    buyer_email character varying(255),
    buyer_name character varying(200),
    buyer_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    CONSTRAINT chk_shop_order_status CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    CONSTRAINT chk_shop_order_total CHECK (total_cents > 0)
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON public.shop_orders (user_id, created_at DESC);

-- Titel, Preis und MwSt-Satz zum Kaufzeitpunkt — spaetere Aenderungen am
-- Artikel aendern keine Rechnung
CREATE TABLE IF NOT EXISTS public.shop_order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.shop_products(id) ON DELETE SET NULL,
    seller_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    sku character varying(40) NOT NULL,
    title character varying(120) NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    vat_rate numeric(4,2) NOT NULL,
    platform_fee_cents integer NOT NULL DEFAULT 0,
    CONSTRAINT chk_shop_item_quantity CHECK (quantity BETWEEN 1 AND 99)
);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_order ON public.shop_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_product ON public.shop_order_items (product_id);

-- Fortlaufende Rechnungsnummern pro Jahr ohne Luecken (Sequenzen koennen
-- Luecken haben). Vergeben per UPDATE ... RETURNING in der Transaktion, die
-- auch die Rechnung schreibt.
CREATE TABLE IF NOT EXISTS public.shop_invoice_counters (
    year integer NOT NULL PRIMARY KEY,
    last_no integer NOT NULL DEFAULT 0
);

-- PDF in der DB, nicht im Object Storage: der Bucket ist public-read
-- (siehe MailService.sendGdprExportEmail)
CREATE TABLE IF NOT EXISTS public.shop_invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE REFERENCES public.shop_orders(id) ON DELETE RESTRICT,
    invoice_number character varying(20) NOT NULL UNIQUE,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    -- Verkaeufer zum Rechnungszeitpunkt (tenant.json legal)
    seller jsonb NOT NULL,
    pdf bytea NOT NULL,
    sent_at timestamp with time zone
);
