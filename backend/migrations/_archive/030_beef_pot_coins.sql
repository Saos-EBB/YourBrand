-- 030_beef_pot_coins.sql
-- Tracks participant entry fees that flow directly into the beef pot.
ALTER TABLE beefs ADD COLUMN pot_coins INT NOT NULL DEFAULT 0;
