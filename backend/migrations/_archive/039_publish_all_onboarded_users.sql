-- 039_publish_all_onboarded_users.sql
-- Bulk-publish all users who have completed onboarding.
-- Safe to run multiple times (idempotent).

UPDATE profiles
SET is_published = true
WHERE onboarding_completed = true
  AND is_published = false;
