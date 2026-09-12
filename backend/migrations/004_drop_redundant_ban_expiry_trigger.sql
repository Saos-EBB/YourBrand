-- 004_drop_redundant_ban_expiry_trigger.sql
-- docs/audit.html (2026-09-12) fand zwei unabhängige Implementierungen derselben
-- Ban-Aufhebungsregel: dieser Trigger (feuert nur bei einem UPDATE auf strikes)
-- und der App-Code — auth.service.ts hebt den Ban beim nächsten Login des
-- Users auf, admin.service.ts:unbanUser() hebt ihn manuell auf.
--
-- Der Trigger war nicht nur redundant, sondern aktiv fehlerhaft: unbanUser()
-- setzt strikes.ban_lifted_at per UPDATE — das feuert denselben BEFORE-UPDATE-
-- Trigger, der bei bereits abgelaufenem expires_at zusätzlich NEW.lifted_by_job
-- = true setzt und damit einen manuellen Admin-Unban fälschlich als
-- job-gelifted markiert.
--
-- App-Code ist jetzt die alleinige Wahrheit für Ban-Aufhebung. Die Spalten
-- strikes.ban_lifted_at und strikes.lifted_by_job bleiben unverändert bestehen
-- (ban_lifted_at wird weiter von admin.service.ts gesetzt, lifted_by_job wird
-- ab jetzt nie mehr automatisch auf true gesetzt).

DROP TRIGGER IF EXISTS trg_strikes_check_ban_expiry ON public.strikes;
DROP FUNCTION IF EXISTS public.trigger_check_ban_expiry();
