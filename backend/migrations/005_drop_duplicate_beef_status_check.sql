-- 005_drop_duplicate_beef_status_check.sql
-- docs/audit.html (2026-09-12) fand zwei CHECK-Constraints auf beefs.status mit
-- identischer Werteliste (nur andere Reihenfolge im ARRAY-Literal, semantisch
-- gleich für eine ANY(ARRAY[...])-Mitgliedschaftsprüfung):
--   beefs_status_check (auto-generierter Name — vermutlich aus einer früheren
--   Migration ohne explizites CONSTRAINT ... CHECK)
--   chk_beef_status (folgt der Projekt-Namenskonvention chk_*, siehe u.a.
--   chk_beef_no_self in derselben Tabelle)
--
-- chk_beef_status bleibt, beefs_status_check wird gedroppt.

ALTER TABLE public.beefs DROP CONSTRAINT IF EXISTS beefs_status_check;
