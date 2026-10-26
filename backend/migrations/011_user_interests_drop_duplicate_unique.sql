-- user_interests hatte denselben UNIQUE (user_id, interest_id) zweimal (uq_user_interest aus dem Schema und
-- user_interests_user_id_interest_id_key aus der alten Matching-Migration): doppelte Schreibkosten bei jedem Insert
-- (Loadtest-Audit B15). uq_user_interest bleibt; ON CONFLICT ohne Constraint-Namen greift weiter.
ALTER TABLE user_interests DROP CONSTRAINT IF EXISTS user_interests_user_id_interest_id_key;
