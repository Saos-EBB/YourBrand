-- 024_coin_starting_bonus_type.sql
-- Erweitert den Typ-Constraint von coin_transactions um 'starting_bonus'
-- für den einmaligen Willkommens-Coin-Bonus bei Registrierung.

ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS chk_coin_tx_type;
ALTER TABLE coin_transactions ADD CONSTRAINT chk_coin_tx_type CHECK (type IN (
  'purchase','earned_beef_open','earned_comment',
  'earned_win','earned_vote_win','spent_vote','house_cut',
  'lottery_win','starting_bonus'
));
