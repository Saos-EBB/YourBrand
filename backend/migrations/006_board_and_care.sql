-- 006_board_and_care.sql
-- Zwei neue Mandanten-Module (tenant.json "modules"):
--
-- board (Schwarzes Brett, KiezConnect): Aushaenge mit Sichtbarkeit nach
--   Umkreis um den Ort des Autors oder oeffentlich (auch ohne Login).
--   "Zettel abreissen" (board_tears) schickt eine Kontaktanfrage.
--
-- caretaker / orgs (Betreuung, Miteinander): managed_accounts und
--   organizations/org_members gibt es seit der Baseline, hier kommt dazu,
--   was der Ablauf braucht — die Zustimmung der betreuten Person
--   (accepted_at), die Zuordnung zu einer Organisation (org_id) und die
--   Freigabe neuer Kontakte durch die Betreuung (contact_requests).
--
-- Idempotent (IF NOT EXISTS), wie 002-005.

CREATE TABLE IF NOT EXISTS public.board_posts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kind character varying(10) NOT NULL,
    title character varying(80) NOT NULL,
    body text NOT NULL,
    street character varying(80),
    -- Ort des Autors beim Aufhaengen (profiles.location), nie die Adresse
    location public.geography(Point,4326),
    visibility character varying(10) NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + interval '14 days') NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT chk_board_kind CHECK (kind IN ('search', 'offer', 'gift', 'meet')),
    CONSTRAINT chk_board_visibility CHECK (visibility IN ('street', 'r500', 'r1000', 'kiez', 'public')),
    CONSTRAINT chk_board_title_length CHECK (length(trim(title)) >= 3),
    CONSTRAINT chk_board_body_length CHECK (length(body) BETWEEN 1 AND 1000),
    CONSTRAINT chk_board_expires_after_create CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_board_posts_location ON public.board_posts USING gist (location);
CREATE INDEX IF NOT EXISTS idx_board_posts_active ON public.board_posts (expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_board_posts_author ON public.board_posts (author_id);

CREATE TABLE IF NOT EXISTS public.board_tears (
    post_id uuid NOT NULL REFERENCES public.board_posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    contact_request_id uuid REFERENCES public.contact_requests(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

-- Einwilligung fuer oeffentliche Aushaenge (AGB § 7, Datenschutz 4.3),
-- einmal pro Nutzer. Widerruf = Aushang loeschen oder Sichtbarkeit aendern.
CREATE TABLE IF NOT EXISTS public.board_public_consents (
    user_id uuid NOT NULL PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Betreuung: erst aktiv, wenn die betreute Person zugestimmt hat
ALTER TABLE public.managed_accounts ADD COLUMN IF NOT EXISTS accepted_at timestamp with time zone;
ALTER TABLE public.managed_accounts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_managed_accounts_caretaker ON public.managed_accounts (caretaker_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_managed_accounts_org ON public.managed_accounts (org_id) WHERE org_id IS NOT NULL;

-- Kontakt-Freigabe: Hat die Empfaengerin vulnerable_flag und eine aktive
-- Betreuung mit can_set_protection, bleibt die Anfrage nach ihrem Ja
-- 'pending', bis die Betreuung freigibt (caretaker_status).
ALTER TABLE public.contact_requests ADD COLUMN IF NOT EXISTS receiver_accepted_at timestamp with time zone;
ALTER TABLE public.contact_requests ADD COLUMN IF NOT EXISTS caretaker_status character varying(10);
ALTER TABLE public.contact_requests DROP CONSTRAINT IF EXISTS chk_contact_caretaker_status;
ALTER TABLE public.contact_requests ADD CONSTRAINT chk_contact_caretaker_status
    CHECK (caretaker_status IS NULL OR caretaker_status IN ('pending', 'approved', 'declined'));
