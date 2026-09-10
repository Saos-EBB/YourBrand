-- 043_onboard_all_except_saos43.sql
-- Alle Profile ausser saos43 (Test-Account fuer den Onboarding-Flow) als
-- onboarded markieren. saos43 wird explizit zurueckgesetzt, damit der
-- Onboarding-Flow mit diesem Account testbar bleibt.
-- Idempotent: WHERE-Klauseln greifen nur bei abweichendem Ist-Zustand.

UPDATE profiles
SET onboarding_completed = true
WHERE nickname <> 'saos43'
  AND onboarding_completed = false;

UPDATE profiles
SET is_published = false,
    onboarding_completed = false
WHERE nickname = 'saos43'
  AND (onboarding_completed = true OR is_published = true);
