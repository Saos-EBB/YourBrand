-- Helper function: returns true when the current DB context belongs to an admin user.
-- Uses current_setting('app.current_user_id', true) — the second arg (true) means
-- the function returns NULL instead of raising if the setting is not defined,
-- so background jobs / cron tasks that never set the var are handled safely.
CREATE OR REPLACE FUNCTION is_admin_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   users
    WHERE  id         = nullif(current_setting('app.current_user_id', true), '')::uuid
      AND  role       = 'admin'
      AND  deleted_at IS NULL
  )
$$;

-- Enable RLS.
-- FORCE ROW LEVEL SECURITY makes the policies apply to the table owner as well,
-- so the app's DB role cannot bypass them even if it owns the table.
ALTER TABLE profile_sensitive_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_sensitive_data FORCE ROW LEVEL SECURITY;

-- Policy 1 — own_data
-- The authenticated user can read and write their own row.
-- FOR ALL covers SELECT, INSERT, UPDATE, and DELETE so that the existing
-- INSERT path in ProfileService.submitSensitiveData continues to work.
-- USING  controls which existing rows are visible / affected.
-- WITH CHECK controls which new/updated rows are accepted.
-- nullif(..., '') converts an unset or empty app.current_user_id to NULL,
-- which causes the expression to evaluate to NULL (falsy) and hides all rows
-- when no user context is set (cron jobs, seed scripts, etc.).
CREATE POLICY own_data ON profile_sensitive_data
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

-- Policy 2 — admin_access
-- Admins can SELECT any row regardless of user_id.
CREATE POLICY admin_access ON profile_sensitive_data
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (is_admin_context());

-- Policy 3 — caretaker_access
-- Managed-account caretakers can SELECT their assigned user's row.
-- Placeholder: evaluates to false until the managed_accounts table exists.
-- When managed_accounts is implemented replace the USING body with:
--
--   EXISTS (
--     SELECT 1 FROM managed_accounts
--     WHERE  caretaker_id    = nullif(current_setting('app.current_user_id', true), '')::uuid
--       AND  managed_user_id = profile_sensitive_data.user_id
--   )
--
CREATE POLICY caretaker_access ON profile_sensitive_data
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (false);
