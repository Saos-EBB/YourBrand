-- Add game_pending and in_game to chk_beef_status constraint
ALTER TABLE beefs DROP CONSTRAINT IF EXISTS chk_beef_status;
ALTER TABLE beefs ADD CONSTRAINT chk_beef_status CHECK (status IN (
  'pending_approval','waiting','active','closed','chickened',
  'game_pending','in_game'
));
