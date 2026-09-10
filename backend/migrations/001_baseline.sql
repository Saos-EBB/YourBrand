-- 001_baseline.sql
-- Consolidated schema baseline (`pg_dump --schema-only` of a fully-migrated dev DB).
-- Replaces migrations 002-043 and schema_v4.sql as the single schema source of
-- truth — those files now live in migrations/_archive/ for history only, do not
-- run them against a DB provisioned from this baseline. New migrations continue
-- from 002 in this directory. See docs/architecture.md for the consolidation
-- rationale.

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: tiger; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA tiger;


--
-- Name: tiger_data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA tiger_data;


--
-- Name: topology; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA topology;


--
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA topology IS 'PostGIS Topology schema';


--
-- Name: fuzzystrmatch; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;


--
-- Name: EXTENSION fuzzystrmatch; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION fuzzystrmatch IS 'determine similarities and distance between strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_tiger_geocoder; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder WITH SCHEMA tiger;


--
-- Name: EXTENSION postgis_tiger_geocoder; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_tiger_geocoder IS 'PostGIS tiger geocoder and reverse geocoder';


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_topology IS 'PostGIS topology spatial types and functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_type AS ENUM (
    'standard',
    'managed'
);


--
-- Name: agb_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agb_type AS ENUM (
    'agb',
    'privacy',
    'sensitive_data'
);


--
-- Name: appeal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.appeal_status AS ENUM (
    'open',
    'approved',
    'rejected'
);


--
-- Name: conv_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conv_member_role AS ENUM (
    'member',
    'admin'
);


--
-- Name: conversation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conversation_status AS ENUM (
    'active',
    'blocked',
    'deleted'
);


--
-- Name: device_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.device_type AS ENUM (
    'ios',
    'android',
    'web'
);


--
-- Name: font_size_option; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.font_size_option AS ENUM (
    'normal',
    'large',
    'xl'
);


--
-- Name: gender_option; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_option AS ENUM (
    'male',
    'female',
    'non_binary',
    'diverse',
    'not_specified'
);


--
-- Name: intent_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.intent_category AS ENUM (
    'mistake',
    'repeat',
    'malicious'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'issued',
    'paid'
);


--
-- Name: looking_for_option; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.looking_for_option AS ENUM (
    'friendship',
    'relationship',
    'exchange',
    'all'
);


--
-- Name: media_context; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_context AS ENUM (
    'profile',
    'chat',
    'org'
);


--
-- Name: media_file_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_file_type AS ENUM (
    'image',
    'audio'
);


--
-- Name: message_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_type AS ENUM (
    'text',
    'image',
    'audio'
);


--
-- Name: moderation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.moderation_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'message',
    'match',
    'system',
    'ban',
    'request',
    'beef_request',
    'beef_accepted',
    'beef_won',
    'beef_lost'
);


--
-- Name: org_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_member_role AS ENUM (
    'admin',
    'member'
);


--
-- Name: payment_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_provider AS ENUM (
    'paypal',
    'sepa'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'success',
    'failed',
    'refunded'
);


--
-- Name: report_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_reason AS ENUM (
    'harassment',
    'spam',
    'fake',
    'sexual',
    'abuse'
);


--
-- Name: report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_status AS ENUM (
    'open',
    'reviewed',
    'closed'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'pending',
    'accepted',
    'declined'
);


--
-- Name: severity_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.severity_level AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: status_message_option; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_message_option AS ENUM (
    'available',
    'looking_for_chat',
    'looking_for_date',
    'busy',
    'do_not_disturb'
);


--
-- Name: strike_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.strike_type AS ENUM (
    'warning',
    'temp',
    'permanent'
);


--
-- Name: subscription_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_plan AS ENUM (
    'monthly',
    'yearly',
    'lifetime'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'active',
    'cancelled',
    'expired'
);


--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'reviewed',
    'resolved',
    'dismissed'
);


--
-- Name: ticket_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_type AS ENUM (
    'nickname',
    'image',
    'audio',
    'other',
    'support_request'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'admin',
    'org',
    'owner'
);


--
-- Name: video_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.video_status AS ENUM (
    'pending',
    'active',
    'ended'
);


--
-- Name: is_admin_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_context() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$

  SELECT EXISTS (

    SELECT 1

    FROM   users

    WHERE  id         = nullif(current_setting('app.current_user_id', true), '')::uuid

      AND  role       = 'admin'

      AND  deleted_at IS NULL

  )

$$;


--
-- Name: pseudonymize_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pseudonymize_user(target_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$

DECLARE

  system_user_id UUID := '00000000-0000-0000-0000-000000000000';

BEGIN

  -- Sicherheitscheck: nur pseudonymisieren wenn deleted_at gesetzt

  IF NOT EXISTS (

    SELECT 1 FROM users

    WHERE id = target_user_id

      AND deleted_at IS NOT NULL

      AND pseudonymized_at IS NULL

  ) THEN

    RAISE EXCEPTION 'User % kann nicht pseudonymisiert werden: nicht gel??scht oder bereits pseudonymisiert', target_user_id;

  END IF;



  -- FIX 5: Alle Refresh-Tokens l??schen (User kann sich nicht mehr einloggen)

  DELETE FROM refresh_tokens WHERE user_id = target_user_id;



  -- User-Felder anonymisieren

  UPDATE users SET

    email               = NULL,

    email_search_hash   = NULL,

    google_id_hash      = NULL,

    password_hash       = NULL,

    ban_reason          = NULL,

    pseudonymized_at    = NOW()

  WHERE id = target_user_id;



  -- Profil anonymisieren

  UPDATE profiles SET

    nickname    = 'Gel??schter Nutzer',

    bio         = NULL,

    city        = NULL,

    location    = NULL,

    photo_id    = NULL

  WHERE user_id = target_user_id;



  -- Art.9 Daten l??schen (DSGVO Pflicht)

  DELETE FROM profile_sensitive_data

  WHERE user_id = target_user_id;



  -- consent_logs: user_id auf System-User setzen (Nachweispflicht bleibt)

  UPDATE consent_logs SET

    user_id = system_user_id

  WHERE user_id = target_user_id;



  -- payment_logs: user_id auf System-User setzen (?? 147 AO Aufbewahrung bleibt)

  UPDATE payment_logs SET

    user_id = system_user_id

  WHERE user_id = target_user_id;



END;

$$;


--
-- Name: trigger_agb_single_current(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_agb_single_current() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

    IF NEW.is_current = true THEN

        UPDATE agb_versions SET is_current = false

        WHERE type = NEW.type

          AND id != NEW.id

          AND is_current = true;

    END IF;

    RETURN NEW;

END;

$$;


--
-- Name: trigger_check_art9_consent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_check_art9_consent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

DECLARE

  consent_valid BOOLEAN;

BEGIN

  SELECT (

    c.accepted = true

    AND a.type = 'sensitive_data'

    AND c.withdrawn_at IS NULL  -- FIX 3: widerrufener Consent ist ung??ltig

  )

  INTO consent_valid

  FROM consent_logs c

  JOIN agb_versions a ON a.id = c.agb_version_id

  WHERE c.id = NEW.consent_id

    AND c.user_id = NEW.user_id;



  IF consent_valid IS NULL OR consent_valid = false THEN

    RAISE EXCEPTION 'Art.9 DSGVO: Keine g??ltige Einwilligung f??r Gesundheitsdaten vorhanden. consent_id: %', NEW.consent_id;

  END IF;



  RETURN NEW;

END;

$$;


--
-- Name: trigger_check_ban_expiry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_check_ban_expiry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= NOW() THEN

    UPDATE users SET

      is_banned       = false,

      ban_reason      = NULL,

      ban_expires_at  = NULL

    WHERE id = NEW.user_id

      AND is_banned = true;  -- nur wenn tats??chlich gebannt



    NEW.ban_lifted_at   = NOW();

    NEW.lifted_by_job   = true;

  END IF;

  RETURN NEW;

END;

$$;


--
-- Name: trigger_consent_withdrawal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_consent_withdrawal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

  -- Nur wenn withdrawn_at neu gesetzt wird (war vorher NULL)

  IF OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL THEN

    -- Art.9 Daten des Users l??schen

    DELETE FROM profile_sensitive_data

    WHERE user_id = NEW.user_id

      AND consent_id = NEW.id;

  END IF;

  RETURN NEW;

END;

$$;


--
-- Name: trigger_log_vulnerable_flag(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_log_vulnerable_flag() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

  IF OLD.vulnerable_flag IS DISTINCT FROM NEW.vulnerable_flag THEN

    INSERT INTO vulnerable_flag_audit (

      user_id, old_value, new_value, changed_at

    ) VALUES (

      NEW.id, OLD.vulnerable_flag, NEW.vulnerable_flag, NOW()

    );

  END IF;

  RETURN NEW;

END;

$$;


--
-- Name: trigger_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

  NEW.updated_at = NOW();

  RETURN NEW;

END;

$$;


--
-- Name: trigger_sort_conversation_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_sort_conversation_users() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

DECLARE

  a UUID;

  b UUID;

BEGIN

  IF NEW.user_a_id > NEW.user_b_id THEN

    a := NEW.user_b_id;

    b := NEW.user_a_id;

    NEW.user_a_id := a;

    NEW.user_b_id := b;

  END IF;

  RETURN NEW;

END;

$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_tickets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    type public.ticket_type NOT NULL,
    status public.ticket_status DEFAULT 'open'::public.ticket_status NOT NULL,
    user_id uuid,
    context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text
);


--
-- Name: agb_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agb_versions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    version character varying(20) NOT NULL,
    type public.agb_type NOT NULL,
    content_normal text NOT NULL,
    content_simple text NOT NULL,
    content_url character varying(512),
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone,
    is_current boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_agb_content_url CHECK (((content_url IS NULL) OR ((content_url)::text ~ '^https://'::text))),
    CONSTRAINT chk_agb_valid_range CHECK (((valid_until IS NULL) OR (valid_until > valid_from))),
    CONSTRAINT chk_agb_version_format CHECK (((version)::text ~ '^\d+\.\d+(\.\d+)?$'::text))
);


--
-- Name: COLUMN agb_versions.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agb_versions.version IS 'Format: 1.0 oder 1.0.1';


--
-- Name: COLUMN agb_versions.content_simple; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agb_versions.content_simple IS 'Leichte Sprache ??? Pflicht f??r Barrierefreiheit.';


--
-- Name: badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badges (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    beef_id uuid NOT NULL,
    type character varying(10) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_badge_type CHECK (((type)::text = ANY (ARRAY[('winner'::character varying)::text, ('loser'::character varying)::text, ('chicken'::character varying)::text])))
);


--
-- Name: beef_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beef_comments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    beef_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_beef_comment_length CHECK (((char_length(content) >= 1) AND (char_length(content) <= 500)))
);


--
-- Name: beef_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beef_games (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    beef_id uuid NOT NULL,
    game_type character varying(30) NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    move_deadline_at timestamp with time zone,
    initiator_ready boolean DEFAULT false NOT NULL,
    target_ready boolean DEFAULT false NOT NULL,
    winner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: beef_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beef_votes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    beef_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    side character varying(10) NOT NULL,
    coins_wagered integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_beef_vote_coins CHECK ((coins_wagered >= 1)),
    CONSTRAINT chk_beef_vote_side CHECK (((side)::text = ANY (ARRAY[('initiator'::character varying)::text, ('target'::character varying)::text])))
);


--
-- Name: beefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beefs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    initiator_id uuid NOT NULL,
    target_id uuid NOT NULL,
    tldr character varying(50) NOT NULL,
    chat_passage text NOT NULL,
    status character varying(20) DEFAULT 'pending_approval'::character varying NOT NULL,
    admin_approved boolean DEFAULT false NOT NULL,
    winner_id uuid,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_seconds integer DEFAULT 86400 NOT NULL,
    game_type character varying(30) DEFAULT 'rps'::character varying NOT NULL,
    game_deadline_at timestamp with time zone,
    pot_coins integer DEFAULT 0 NOT NULL,
    comment_window_until timestamp with time zone,
    CONSTRAINT beefs_status_check CHECK (((status)::text = ANY (ARRAY[('pending_approval'::character varying)::text, ('waiting'::character varying)::text, ('active'::character varying)::text, ('game_pending'::character varying)::text, ('in_game'::character varying)::text, ('closed'::character varying)::text, ('chickened'::character varying)::text]))),
    CONSTRAINT chk_beef_no_self CHECK ((initiator_id <> target_id)),
    CONSTRAINT chk_beef_status CHECK (((status)::text = ANY (ARRAY[('pending_approval'::character varying)::text, ('waiting'::character varying)::text, ('active'::character varying)::text, ('closed'::character varying)::text, ('chickened'::character varying)::text, ('game_pending'::character varying)::text, ('in_game'::character varying)::text])))
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_block_no_self CHECK ((blocker_id <> blocked_id)),
    CONSTRAINT chk_block_reason_length CHECK (((reason IS NULL) OR (length(reason) <= 500)))
);


--
-- Name: cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    country character varying(100) NOT NULL,
    region character varying(100),
    population integer,
    lat numeric(9,6) NOT NULL,
    lng numeric(9,6) NOT NULL,
    is_capital boolean DEFAULT false NOT NULL
);


--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: coin_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coin_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    amount integer NOT NULL,
    type character varying(30) NOT NULL,
    beef_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key character varying(255),
    CONSTRAINT chk_coin_tx_type CHECK (((type)::text = ANY (ARRAY[('purchase'::character varying)::text, ('earned_beef_open'::character varying)::text, ('earned_comment'::character varying)::text, ('earned_win'::character varying)::text, ('earned_vote_win'::character varying)::text, ('spent_vote'::character varying)::text, ('house_cut'::character varying)::text, ('lottery_win'::character varying)::text, ('starting_bonus'::character varying)::text, ('spent_beef_open'::character varying)::text, ('spent_beef_accept'::character varying)::text])))
);


--
-- Name: consent_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    agb_version_id uuid NOT NULL,
    accepted boolean NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_hash character varying(64) NOT NULL,
    tp_hash character varying(64),
    withdrawn_at timestamp with time zone,
    withdraw_reason text,
    CONSTRAINT chk_consent_ip_hash_length CHECK ((length((ip_hash)::text) = 64)),
    CONSTRAINT chk_consent_withdraw_after_accept CHECK (((withdrawn_at IS NULL) OR (withdrawn_at > accepted_at)))
);


--
-- Name: TABLE consent_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_logs IS 'DSGVO Art.7: Nachweispflicht. ON DELETE RESTRICT.';


--
-- Name: contact_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    status public.request_status DEFAULT 'pending'::public.request_status NOT NULL,
    message_preview text,
    expired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT chk_contact_no_self CHECK ((sender_id <> receiver_id)),
    CONSTRAINT chk_contact_preview_length CHECK (((message_preview IS NULL) OR (length(message_preview) <= 300))),
    CONSTRAINT chk_contact_respond_after_create CHECK (((responded_at IS NULL) OR (responded_at >= created_at)))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_a_id uuid NOT NULL,
    user_b_id uuid NOT NULL,
    contact_request_id uuid,
    status public.conversation_status DEFAULT 'active'::public.conversation_status NOT NULL,
    images_enabled boolean DEFAULT false NOT NULL,
    audio_enabled boolean DEFAULT false NOT NULL,
    video_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone,
    purged_at timestamp with time zone,
    deleted_at_a timestamp with time zone,
    deleted_at_b timestamp with time zone,
    CONSTRAINT chk_conversation_no_self CHECK ((user_a_id <> user_b_id)),
    CONSTRAINT chk_conversation_user_order CHECK ((user_a_id < user_b_id))
);


--
-- Name: CONSTRAINT chk_conversation_user_order ON conversations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_conversation_user_order ON public.conversations IS 'DB-Trigger sortiert automatisch. user_a_id immer < user_b_id.';


--
-- Name: interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name_de character varying(50) NOT NULL,
    name_en character varying(50),
    category character varying(50),
    CONSTRAINT chk_interests_name_de CHECK ((length(TRIM(BOTH FROM name_de)) >= 2))
);


--
-- Name: managed_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.managed_accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    caretaker_id uuid NOT NULL,
    consent_log_id uuid,
    can_read_chat boolean DEFAULT false NOT NULL,
    can_write_chat boolean DEFAULT false NOT NULL,
    can_set_protection boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_managed_no_self CHECK ((user_id <> caretaker_id)),
    CONSTRAINT chk_managed_revoke_after_create CHECK (((revoked_at IS NULL) OR (revoked_at > created_at)))
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_a_id uuid NOT NULL,
    user_b_id uuid NOT NULL,
    conversation_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_uploads (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    uploaded_by uuid NOT NULL,
    file_url character varying(1024) NOT NULL,
    file_type public.media_file_type NOT NULL,
    file_use_for character varying(100),
    context public.media_context NOT NULL,
    conversation_id uuid,
    org_id uuid,
    moderation_status public.moderation_status DEFAULT 'pending'::public.moderation_status NOT NULL,
    is_encrypted boolean DEFAULT false NOT NULL,
    file_size_kb integer NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    purged_at timestamp with time zone,
    needs_review boolean DEFAULT true NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    review_rejected_reason text,
    CONSTRAINT chk_media_file_size CHECK (((file_size_kb > 0) AND (file_size_kb <= 51200))),
    CONSTRAINT chk_media_purge_after_delete CHECK (((purged_at IS NULL) OR ((deleted_at IS NOT NULL) AND (purged_at > deleted_at))))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text,
    media_id uuid,
    type public.message_type DEFAULT 'text'::public.message_type NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    flagged boolean DEFAULT false NOT NULL,
    flagged_by uuid,
    flagged_at timestamp with time zone,
    read_at timestamp with time zone,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    purged_at timestamp with time zone,
    CONSTRAINT chk_message_content_length CHECK (((content IS NULL) OR (length(content) <= 10000))),
    CONSTRAINT chk_message_flag_consistency CHECK ((((flagged = false) AND (flagged_by IS NULL) AND (flagged_at IS NULL)) OR ((flagged = true) AND (flagged_by IS NOT NULL) AND (flagged_at IS NOT NULL)))),
    CONSTRAINT chk_message_has_content CHECK ((((type = 'text'::public.message_type) AND (content IS NOT NULL)) OR ((type = ANY (ARRAY['image'::public.message_type, 'audio'::public.message_type])) AND (media_id IS NOT NULL)))),
    CONSTRAINT chk_message_purge_after_delete CHECK (((purged_at IS NULL) OR ((deleted_at IS NOT NULL) AND (purged_at > deleted_at)))),
    CONSTRAINT chk_message_read_after_sent CHECK (((read_at IS NULL) OR (read_at >= sent_at)))
);


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    email_messages boolean DEFAULT true NOT NULL,
    email_matches boolean DEFAULT true NOT NULL,
    email_system boolean DEFAULT true NOT NULL,
    push_messages boolean DEFAULT true NOT NULL,
    push_matches boolean DEFAULT true NOT NULL,
    push_system boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title character varying(255),
    related_id text,
    content_vars jsonb,
    CONSTRAINT chk_notification_content_length CHECK ((length(content) <= 500))
);


--
-- Name: org_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    role public.org_member_role DEFAULT 'member'::public.org_member_role NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    CONSTRAINT chk_org_member_left_after_join CHECK (((left_at IS NULL) OR (left_at > joined_at)))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_user_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    logo_id uuid,
    description text,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT chk_org_description_length CHECK (((description IS NULL) OR (length(description) <= 2000))),
    CONSTRAINT chk_org_name_length CHECK ((length(TRIM(BOTH FROM name)) >= 2))
);


--
-- Name: payment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    tax_amount numeric(10,2),
    currency character varying(3) DEFAULT 'EUR'::character varying NOT NULL,
    status public.payment_status NOT NULL,
    provider_tx_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_payment_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT chk_payment_currency CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT chk_payment_tax_positive CHECK (((tax_amount IS NULL) OR (tax_amount >= (0)::numeric)))
);


--
-- Name: TABLE payment_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_logs IS '?? 147 AO: 7 Jahre Aufbewahrungspflicht. ON DELETE RESTRICT.';


--
-- Name: profanity_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profanity_flags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    word text NOT NULL,
    context_type text NOT NULL,
    flagged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profanity_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profanity_words (
    word text NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_sensitive_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_sensitive_data (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    consent_id uuid NOT NULL,
    disability_type bytea,
    disability_visible boolean DEFAULT false NOT NULL,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.profile_sensitive_data FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE profile_sensitive_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profile_sensitive_data IS 'Art.9 DSGVO. Eigene Einwilligung (consent_id) zwingend. AES-256.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    nickname character varying(30) NOT NULL,
    birthdate date NOT NULL,
    bio text,
    photo_id uuid,
    city character varying(100),
    location public.geography(Point,4326),
    search_radius_km integer DEFAULT 20 NOT NULL,
    lang_simple boolean DEFAULT false NOT NULL,
    font_size public.font_size_option DEFAULT 'normal'::public.font_size_option NOT NULL,
    high_contrast boolean DEFAULT false NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gender public.gender_option,
    looking_for public.looking_for_option,
    last_active_at timestamp with time zone,
    status_visible boolean DEFAULT true NOT NULL,
    status_message public.status_message_option DEFAULT 'available'::public.status_message_option,
    nickname_changed_at timestamp with time zone,
    gender_changed_at timestamp with time zone,
    profanity_filter boolean DEFAULT true NOT NULL,
    audio_id uuid,
    show_bio boolean DEFAULT true NOT NULL,
    show_city boolean DEFAULT true NOT NULL,
    show_age boolean DEFAULT true NOT NULL,
    show_gender boolean DEFAULT true NOT NULL,
    show_interests boolean DEFAULT true NOT NULL,
    show_audio boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_profiles_bio_length CHECK (((bio IS NULL) OR (length(bio) <= 1000))),
    CONSTRAINT chk_profiles_birthdate_min_age CHECK ((birthdate <= (CURRENT_DATE - '18 years'::interval))),
    CONSTRAINT chk_profiles_nickname CHECK (((nickname)::text ~ '^[a-zA-Z0-9_\-\.]{3,30}$'::text)),
    CONSTRAINT chk_profiles_publish_requires_onboarding CHECK (((is_published = false) OR (onboarding_completed = true))),
    CONSTRAINT chk_profiles_radius CHECK (((search_radius_km > 0) AND (search_radius_km <= 500)))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    device_info character varying(255),
    is_revoked boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_refresh_expires_future CHECK ((expires_at > created_at)),
    CONSTRAINT chk_refresh_token_hash_length CHECK ((length((token_hash)::text) = 64))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    reporter_id uuid NOT NULL,
    reported_user_id uuid NOT NULL,
    message_id uuid,
    reason public.report_reason NOT NULL,
    description text,
    status public.report_status DEFAULT 'open'::public.report_status NOT NULL,
    intent_category public.intent_category,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    deleted_at timestamp with time zone,
    note text,
    CONSTRAINT chk_report_description_length CHECK (((description IS NULL) OR (length(description) <= 2000))),
    CONSTRAINT chk_report_no_self CHECK ((reporter_id <> reported_user_id)),
    CONSTRAINT chk_report_reviewed_after_created CHECK (((reviewed_at IS NULL) OR (reviewed_at >= created_at)))
);


--
-- Name: strikes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strikes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    report_id uuid,
    issued_by uuid NOT NULL,
    type public.strike_type NOT NULL,
    reason text NOT NULL,
    expires_at timestamp with time zone,
    ban_lifted_at timestamp with time zone,
    lifted_by_job boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_strike_not_self_issued CHECK ((user_id <> issued_by)),
    CONSTRAINT chk_strike_permanent_no_expiry CHECK (((type <> 'permanent'::public.strike_type) OR (expires_at IS NULL))),
    CONSTRAINT chk_strike_reason_length CHECK (((length(reason) >= 10) AND (length(reason) <= 2000))),
    CONSTRAINT chk_strike_temp_needs_expiry CHECK (((type <> 'temp'::public.strike_type) OR (expires_at IS NOT NULL)))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    plan public.subscription_plan NOT NULL,
    status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL,
    payment_provider public.payment_provider NOT NULL,
    provider_subscription_id character varying(255),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT chk_sub_cancel_after_start CHECK (((cancelled_at IS NULL) OR (cancelled_at >= started_at))),
    CONSTRAINT chk_sub_expires_after_start CHECK (((expires_at IS NULL) OR (expires_at > started_at))),
    CONSTRAINT chk_sub_lifetime_no_expiry CHECK (((plan <> 'lifetime'::public.subscription_plan) OR (expires_at IS NULL)))
);


--
-- Name: swipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.swipes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    swiper_id uuid NOT NULL,
    swiped_id uuid NOT NULL,
    action character varying(10) NOT NULL,
    swiped_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT swipes_action_check CHECK (((action)::text = ANY (ARRAY[('like'::character varying)::text, ('skip'::character varying)::text])))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: teeth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teeth (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    beef_id uuid NOT NULL,
    converted_to_chain boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tooth_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tooth_chains (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: typeorm_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.typeorm_migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: typeorm_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.typeorm_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: typeorm_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.typeorm_migrations_id_seq OWNED BY public.typeorm_migrations.id;


--
-- Name: user_coin_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_coin_balance (
    user_id uuid NOT NULL,
    balance integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_coin_balance_non_negative CHECK ((balance >= 0))
);


--
-- Name: user_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_interests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    interest_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_green boolean DEFAULT true NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email bytea,
    email_search_hash character varying(64),
    password_hash character varying,
    google_id_hash character varying(64),
    preferred_locale character varying(10),
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    account_type public.account_type DEFAULT 'standard'::public.account_type NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    ban_reason text,
    ban_expires_at timestamp with time zone,
    vulnerable_flag boolean DEFAULT false NOT NULL,
    enhanced_protection boolean DEFAULT false NOT NULL,
    email_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login timestamp with time zone,
    deleted_at timestamp with time zone,
    pseudonymized_at timestamp with time zone,
    last_gdpr_export_at timestamp with time zone,
    public_id character varying(12),
    chicken_count integer DEFAULT 0 NOT NULL,
    exile_until timestamp with time zone,
    email_verification_token character varying(128),
    email_verification_expires_at timestamp with time zone,
    password_reset_token character varying(128),
    password_reset_expires_at timestamp with time zone,
    CONSTRAINT chk_users_ban_reason CHECK (((is_banned = false) OR (ban_reason IS NOT NULL))),
    CONSTRAINT chk_users_email_hash_length CHECK (((email_search_hash IS NULL) OR (length((email_search_hash)::text) = 64))),
    CONSTRAINT chk_users_google_hash_length CHECK (((google_id_hash IS NULL) OR (length((google_id_hash)::text) = 64))),
    CONSTRAINT chk_users_locale CHECK (((preferred_locale IS NULL) OR ((preferred_locale)::text ~ '^[a-z]{2}(-[A-Z]{2})?$'::text))),
    CONSTRAINT chk_users_login_method CHECK (((email_search_hash IS NOT NULL) OR (google_id_hash IS NOT NULL))),
    CONSTRAINT chk_users_pseudonymized_after_deleted CHECK (((pseudonymized_at IS NULL) OR (deleted_at IS NOT NULL)))
);


--
-- Name: COLUMN users.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.email IS 'AES-256 (pgcrypto). Nie im Klartext in der DB.';


--
-- Name: COLUMN users.email_search_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.email_search_hash IS 'SHA-256 + App-Salt. Exakt 64 Zeichen.';


--
-- Name: COLUMN users.vulnerable_flag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.vulnerable_flag IS 'Art.9 ??? nur Admin/Caretaker. Backend-Guard + Audit-Trigger.';


--
-- Name: users_pending_pseudonymization; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.users_pending_pseudonymization AS
 SELECT id,
    deleted_at
   FROM public.users
  WHERE ((deleted_at IS NOT NULL) AND (pseudonymized_at IS NULL) AND (deleted_at < (now() - '30 days'::interval)) AND (id <> '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: VIEW users_pending_pseudonymization; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.users_pending_pseudonymization IS 'Cronjob ruft diese View ab und ruft pseudonymize_user(id) f??r jeden Eintrag auf.';


--
-- Name: users_with_expired_bans; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.users_with_expired_bans AS
 SELECT id,
    ban_expires_at
   FROM public.users
  WHERE ((is_banned = true) AND (ban_expires_at IS NOT NULL) AND (ban_expires_at <= now()) AND (id <> '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: VIEW users_with_expired_bans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.users_with_expired_bans IS 'Backend-Cronjob und Login-Check: User hier drin m??ssen is_banned=false gesetzt werden.';


--
-- Name: vulnerable_flag_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vulnerable_flag_audit (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
    old_value boolean NOT NULL,
    new_value boolean NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE vulnerable_flag_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vulnerable_flag_audit IS 'Jede ??nderung von vulnerable_flag wird hier geloggt. Unver??nderlich.';


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: typeorm_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typeorm_migrations ALTER COLUMN id SET DEFAULT nextval('public.typeorm_migrations_id_seq'::regclass);


--
-- Name: typeorm_migrations PK_bb2f075707dd300ba86d0208923; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typeorm_migrations
    ADD CONSTRAINT "PK_bb2f075707dd300ba86d0208923" PRIMARY KEY (id);


--
-- Name: admin_tickets admin_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_tickets
    ADD CONSTRAINT admin_tickets_pkey PRIMARY KEY (id);


--
-- Name: agb_versions agb_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agb_versions
    ADD CONSTRAINT agb_versions_pkey PRIMARY KEY (id);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);


--
-- Name: beef_comments beef_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_comments
    ADD CONSTRAINT beef_comments_pkey PRIMARY KEY (id);


--
-- Name: beef_games beef_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_games
    ADD CONSTRAINT beef_games_pkey PRIMARY KEY (id);


--
-- Name: beef_votes beef_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_votes
    ADD CONSTRAINT beef_votes_pkey PRIMARY KEY (id);


--
-- Name: beefs beefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beefs
    ADD CONSTRAINT beefs_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: coin_transactions coin_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_transactions
    ADD CONSTRAINT coin_transactions_pkey PRIMARY KEY (id);


--
-- Name: consent_logs consent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_logs
    ADD CONSTRAINT consent_logs_pkey PRIMARY KEY (id);


--
-- Name: contact_requests contact_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: interests interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interests
    ADD CONSTRAINT interests_pkey PRIMARY KEY (id);


--
-- Name: managed_accounts managed_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.managed_accounts
    ADD CONSTRAINT managed_accounts_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pair_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pair_unique UNIQUE (user_a_id, user_b_id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: media_uploads media_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_uploads
    ADD CONSTRAINT media_uploads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: org_members org_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: payment_logs payment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT payment_logs_pkey PRIMARY KEY (id);


--
-- Name: profanity_flags profanity_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profanity_flags
    ADD CONSTRAINT profanity_flags_pkey PRIMARY KEY (id);


--
-- Name: profanity_words profanity_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profanity_words
    ADD CONSTRAINT profanity_words_pkey PRIMARY KEY (word);


--
-- Name: profile_sensitive_data profile_sensitive_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_sensitive_data
    ADD CONSTRAINT profile_sensitive_data_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: strikes strikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strikes
    ADD CONSTRAINT strikes_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: swipes swipes_pair_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_pair_unique UNIQUE (swiper_id, swiped_id);


--
-- Name: swipes swipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: teeth teeth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teeth
    ADD CONSTRAINT teeth_pkey PRIMARY KEY (id);


--
-- Name: tooth_chains tooth_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tooth_chains
    ADD CONSTRAINT tooth_chains_pkey PRIMARY KEY (id);


--
-- Name: agb_versions uq_agb_version_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agb_versions
    ADD CONSTRAINT uq_agb_version_type UNIQUE (version, type);


--
-- Name: beef_votes uq_beef_vote; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_votes
    ADD CONSTRAINT uq_beef_vote UNIQUE (beef_id, voter_id);


--
-- Name: blocks uq_block; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT uq_block UNIQUE (blocker_id, blocked_id);


--
-- Name: consent_logs uq_consent_user_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_logs
    ADD CONSTRAINT uq_consent_user_version UNIQUE (user_id, agb_version_id);


--
-- Name: contact_requests uq_contact_request_active; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT uq_contact_request_active EXCLUDE USING btree (sender_id WITH =, receiver_id WITH =) WHERE ((status = ANY (ARRAY['pending'::public.request_status, 'accepted'::public.request_status])));


--
-- Name: conversations uq_conversation_users; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT uq_conversation_users UNIQUE (user_a_id, user_b_id);


--
-- Name: interests uq_interests_name_de; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interests
    ADD CONSTRAINT uq_interests_name_de UNIQUE (name_de);


--
-- Name: managed_accounts uq_managed_user_caretaker; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.managed_accounts
    ADD CONSTRAINT uq_managed_user_caretaker UNIQUE (user_id, caretaker_id);


--
-- Name: notification_settings uq_notification_settings_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT uq_notification_settings_user UNIQUE (user_id);


--
-- Name: org_members uq_org_members; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT uq_org_members UNIQUE (org_id, user_id);


--
-- Name: profiles uq_profiles_nickname; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT uq_profiles_nickname UNIQUE (nickname);


--
-- Name: profiles uq_profiles_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT uq_profiles_user UNIQUE (user_id);


--
-- Name: refresh_tokens uq_refresh_token_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash);


--
-- Name: profile_sensitive_data uq_sensitive_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_sensitive_data
    ADD CONSTRAINT uq_sensitive_user UNIQUE (user_id);


--
-- Name: user_interests uq_user_interest; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT uq_user_interest UNIQUE (user_id, interest_id);


--
-- Name: users uq_users_email_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_users_email_hash UNIQUE (email_search_hash);


--
-- Name: users uq_users_google_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_users_google_id UNIQUE (google_id_hash);


--
-- Name: user_coin_balance user_coin_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_coin_balance
    ADD CONSTRAINT user_coin_balance_pkey PRIMARY KEY (user_id);


--
-- Name: user_interests user_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_pkey PRIMARY KEY (id);


--
-- Name: user_interests user_interests_user_id_interest_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_interest_id_key UNIQUE (user_id, interest_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_public_id_key UNIQUE (public_id);


--
-- Name: vulnerable_flag_audit vulnerable_flag_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vulnerable_flag_audit
    ADD CONSTRAINT vulnerable_flag_audit_pkey PRIMARY KEY (id);


--
-- Name: beef_games_beef_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX beef_games_beef_id_idx ON public.beef_games USING btree (beef_id);


--
-- Name: idx_admin_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tickets_status ON public.admin_tickets USING btree (status);


--
-- Name: idx_admin_tickets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tickets_type ON public.admin_tickets USING btree (type);


--
-- Name: idx_admin_tickets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tickets_user ON public.admin_tickets USING btree (user_id);


--
-- Name: idx_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_blocked ON public.blocks USING btree (blocked_id);


--
-- Name: idx_blocks_blocker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_blocker ON public.blocks USING btree (blocker_id);


--
-- Name: idx_cities_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cities_country ON public.cities USING btree (country);


--
-- Name: idx_cities_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cities_name ON public.cities USING gin (to_tsvector('simple'::regconfig, (name)::text));


--
-- Name: idx_consent_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_user ON public.consent_logs USING btree (user_id);


--
-- Name: idx_contact_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_receiver ON public.contact_requests USING btree (receiver_id);


--
-- Name: idx_contact_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_status ON public.contact_requests USING btree (status);


--
-- Name: idx_conv_deleted_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_deleted_a ON public.conversations USING btree (deleted_at_a) WHERE (deleted_at_a IS NOT NULL);


--
-- Name: idx_conv_deleted_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_deleted_b ON public.conversations USING btree (deleted_at_b) WHERE (deleted_at_b IS NOT NULL);


--
-- Name: idx_conv_last_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_last_msg ON public.conversations USING btree (last_message_at DESC NULLS LAST);


--
-- Name: idx_conv_user_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_user_a ON public.conversations USING btree (user_a_id);


--
-- Name: idx_conv_user_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_user_b ON public.conversations USING btree (user_b_id);


--
-- Name: idx_matches_user_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user_a ON public.matches USING btree (user_a_id);


--
-- Name: idx_matches_user_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user_b ON public.matches USING btree (user_b_id);


--
-- Name: idx_media_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_deleted ON public.media_uploads USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_media_moderation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_moderation ON public.media_uploads USING btree (moderation_status);


--
-- Name: idx_media_uploader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_uploader ON public.media_uploads USING btree (uploaded_by);


--
-- Name: idx_media_uploads_needs_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_uploads_needs_review ON public.media_uploads USING btree (needs_review) WHERE (needs_review = true);


--
-- Name: idx_msg_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msg_conversation ON public.messages USING btree (conversation_id, sent_at DESC);


--
-- Name: idx_msg_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msg_deleted ON public.messages USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_msg_flagged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msg_flagged ON public.messages USING btree (flagged) WHERE (flagged = true);


--
-- Name: idx_msg_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msg_sender ON public.messages USING btree (sender_id);


--
-- Name: idx_msg_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msg_unread ON public.messages USING btree (read_at) WHERE (read_at IS NULL);


--
-- Name: idx_notif_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: idx_profanity_flags_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profanity_flags_user_time ON public.profanity_flags USING btree (user_id, flagged_at);


--
-- Name: idx_profiles_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_city ON public.profiles USING btree (city);


--
-- Name: idx_profiles_last_active_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_last_active_at ON public.profiles USING btree (last_active_at);


--
-- Name: idx_profiles_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_location ON public.profiles USING gist (location);


--
-- Name: idx_profiles_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_published ON public.profiles USING btree (is_published) WHERE (is_published = true);


--
-- Name: idx_refresh_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_expires ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_revoked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_revoked ON public.refresh_tokens USING btree (is_revoked) WHERE (is_revoked = false);


--
-- Name: idx_refresh_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_reports_reported; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reported ON public.reports USING btree (reported_user_id);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.reports USING btree (status);


--
-- Name: idx_sensitive_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sensitive_user ON public.profile_sensitive_data USING btree (user_id);


--
-- Name: idx_sensitive_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sensitive_visible ON public.profile_sensitive_data USING btree (disability_visible) WHERE (disability_visible = true);


--
-- Name: idx_strikes_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strikes_expires ON public.strikes USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_strikes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strikes_user ON public.strikes USING btree (user_id);


--
-- Name: idx_sub_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_expires ON public.subscriptions USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_sub_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_status ON public.subscriptions USING btree (status);


--
-- Name: idx_sub_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_user ON public.subscriptions USING btree (user_id);


--
-- Name: idx_swipes_swiped_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_swipes_swiped_action ON public.swipes USING btree (swiped_id, action);


--
-- Name: idx_swipes_swiper_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_swipes_swiper_at ON public.swipes USING btree (swiper_id, swiped_at);


--
-- Name: idx_user_interests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_interests_user ON public.user_interests USING btree (user_id);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: idx_users_exile_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_exile_until ON public.users USING btree (exile_until) WHERE (exile_until IS NOT NULL);


--
-- Name: idx_users_is_banned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_banned ON public.users USING btree (is_banned);


--
-- Name: idx_users_pseudonymized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_pseudonymized ON public.users USING btree (pseudonymized_at) WHERE (pseudonymized_at IS NULL);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_vulnerable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_vulnerable ON public.users USING btree (vulnerable_flag) WHERE (vulnerable_flag = true);


--
-- Name: idx_vuln_audit_changed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vuln_audit_changed ON public.vulnerable_flag_audit USING btree (changed_at);


--
-- Name: idx_vuln_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vuln_audit_user ON public.vulnerable_flag_audit USING btree (user_id);


--
-- Name: one_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_owner ON public.users USING btree (role) WHERE (role = 'owner'::public.user_role);


--
-- Name: uq_coin_transactions_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_coin_transactions_idempotency_key ON public.coin_transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: agb_versions trg_agb_single_current; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agb_single_current BEFORE INSERT OR UPDATE ON public.agb_versions FOR EACH ROW EXECUTE FUNCTION public.trigger_agb_single_current();


--
-- Name: consent_logs trg_consent_withdrawal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_consent_withdrawal AFTER UPDATE ON public.consent_logs FOR EACH ROW EXECUTE FUNCTION public.trigger_consent_withdrawal();


--
-- Name: conversations trg_conversations_sort_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conversations_sort_users BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.trigger_sort_conversation_users();


--
-- Name: notification_settings trg_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: profile_sensitive_data trg_sensitive_data_consent_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sensitive_data_consent_check BEFORE INSERT OR UPDATE ON public.profile_sensitive_data FOR EACH ROW EXECUTE FUNCTION public.trigger_check_art9_consent();


--
-- Name: profile_sensitive_data trg_sensitive_data_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sensitive_data_updated_at BEFORE UPDATE ON public.profile_sensitive_data FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: strikes trg_strikes_check_ban_expiry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_strikes_check_ban_expiry BEFORE UPDATE ON public.strikes FOR EACH ROW EXECUTE FUNCTION public.trigger_check_ban_expiry();


--
-- Name: users trg_users_vulnerable_flag_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_vulnerable_flag_audit AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.trigger_log_vulnerable_flag();


--
-- Name: admin_tickets admin_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_tickets
    ADD CONSTRAINT admin_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: badges badges_beef_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_beef_id_fkey FOREIGN KEY (beef_id) REFERENCES public.beefs(id) ON DELETE CASCADE;


--
-- Name: badges badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: beef_comments beef_comments_beef_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_comments
    ADD CONSTRAINT beef_comments_beef_id_fkey FOREIGN KEY (beef_id) REFERENCES public.beefs(id) ON DELETE CASCADE;


--
-- Name: beef_comments beef_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_comments
    ADD CONSTRAINT beef_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: beef_games beef_games_beef_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_games
    ADD CONSTRAINT beef_games_beef_id_fkey FOREIGN KEY (beef_id) REFERENCES public.beefs(id) ON DELETE CASCADE;


--
-- Name: beef_games beef_games_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_games
    ADD CONSTRAINT beef_games_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: beef_votes beef_votes_beef_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_votes
    ADD CONSTRAINT beef_votes_beef_id_fkey FOREIGN KEY (beef_id) REFERENCES public.beefs(id) ON DELETE CASCADE;


--
-- Name: beef_votes beef_votes_voter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beef_votes
    ADD CONSTRAINT beef_votes_voter_id_fkey FOREIGN KEY (voter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: beefs beefs_initiator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beefs
    ADD CONSTRAINT beefs_initiator_id_fkey FOREIGN KEY (initiator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: beefs beefs_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beefs
    ADD CONSTRAINT beefs_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: beefs beefs_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beefs
    ADD CONSTRAINT beefs_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: blocks blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: coin_transactions coin_transactions_beef_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_transactions
    ADD CONSTRAINT coin_transactions_beef_id_fkey FOREIGN KEY (beef_id) REFERENCES public.beefs(id) ON DELETE SET NULL;


--
-- Name: coin_transactions coin_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_transactions
    ADD CONSTRAINT coin_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: consent_logs consent_logs_agb_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_logs
    ADD CONSTRAINT consent_logs_agb_version_id_fkey FOREIGN KEY (agb_version_id) REFERENCES public.agb_versions(id) ON DELETE RESTRICT;


--
-- Name: consent_logs consent_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_logs
    ADD CONSTRAINT consent_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: contact_requests contact_requests_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: contact_requests contact_requests_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_contact_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_request_id_fkey FOREIGN KEY (contact_request_id) REFERENCES public.contact_requests(id) ON DELETE RESTRICT;


--
-- Name: conversations conversations_user_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_a_id_fkey FOREIGN KEY (user_a_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_b_id_fkey FOREIGN KEY (user_b_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: managed_accounts managed_accounts_caretaker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.managed_accounts
    ADD CONSTRAINT managed_accounts_caretaker_id_fkey FOREIGN KEY (caretaker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: managed_accounts managed_accounts_consent_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.managed_accounts
    ADD CONSTRAINT managed_accounts_consent_log_id_fkey FOREIGN KEY (consent_log_id) REFERENCES public.consent_logs(id) ON DELETE SET NULL;


--
-- Name: managed_accounts managed_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.managed_accounts
    ADD CONSTRAINT managed_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: matches matches_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: matches matches_user_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user_a_id_fkey FOREIGN KEY (user_a_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: matches matches_user_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user_b_id_fkey FOREIGN KEY (user_b_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media_uploads media_uploads_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_uploads
    ADD CONSTRAINT media_uploads_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_uploads media_uploads_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_uploads
    ADD CONSTRAINT media_uploads_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_flagged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_flagged_by_fkey FOREIGN KEY (flagged_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_uploads(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_settings notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_logo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_logo_id_fkey FOREIGN KEY (logo_id) REFERENCES public.media_uploads(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payment_logs payment_logs_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT payment_logs_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE RESTRICT;


--
-- Name: payment_logs payment_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT payment_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: profanity_flags profanity_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profanity_flags
    ADD CONSTRAINT profanity_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profanity_words profanity_words_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profanity_words
    ADD CONSTRAINT profanity_words_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: profile_sensitive_data profile_sensitive_data_consent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_sensitive_data
    ADD CONSTRAINT profile_sensitive_data_consent_id_fkey FOREIGN KEY (consent_id) REFERENCES public.consent_logs(id) ON DELETE RESTRICT;


--
-- Name: profile_sensitive_data profile_sensitive_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_sensitive_data
    ADD CONSTRAINT profile_sensitive_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_audio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_audio_id_fkey FOREIGN KEY (audio_id) REFERENCES public.media_uploads(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.media_uploads(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: reports reports_reported_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: strikes strikes_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strikes
    ADD CONSTRAINT strikes_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: strikes strikes_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strikes
    ADD CONSTRAINT strikes_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE RESTRICT;


--
-- Name: strikes strikes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strikes
    ADD CONSTRAINT strikes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: swipes swipes_swiped_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_swiped_id_fkey FOREIGN KEY (swiped_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: swipes swipes_swiper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_swiper_id_fkey FOREIGN KEY (swiper_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: teeth teeth_beef_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teeth
    ADD CONSTRAINT teeth_beef_id_fkey FOREIGN KEY (beef_id) REFERENCES public.beefs(id) ON DELETE CASCADE;


--
-- Name: teeth teeth_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teeth
    ADD CONSTRAINT teeth_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: teeth teeth_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teeth
    ADD CONSTRAINT teeth_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tooth_chains tooth_chains_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tooth_chains
    ADD CONSTRAINT tooth_chains_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_coin_balance user_coin_balance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_coin_balance
    ADD CONSTRAINT user_coin_balance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_interests user_interests_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_interest_id_fkey FOREIGN KEY (interest_id) REFERENCES public.interests(id) ON DELETE CASCADE;


--
-- Name: user_interests user_interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vulnerable_flag_audit vulnerable_flag_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vulnerable_flag_audit
    ADD CONSTRAINT vulnerable_flag_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET DEFAULT;


--
-- Name: profile_sensitive_data admin_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_access ON public.profile_sensitive_data FOR SELECT USING (public.is_admin_context());


--
-- Name: profile_sensitive_data caretaker_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY caretaker_access ON public.profile_sensitive_data FOR SELECT USING (false);


--
-- Name: profile_sensitive_data own_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_data ON public.profile_sensitive_data USING ((user_id = (NULLIF(current_setting('app.current_user_id'::text, true), ''::text))::uuid)) WITH CHECK ((user_id = (NULLIF(current_setting('app.current_user_id'::text, true), ''::text))::uuid));


--
-- Name: profile_sensitive_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_sensitive_data ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

