-- Ein Spiel pro Beef. startGamePhase lief aus dem Minuten-Cron auf jeder Backend-Instanz und konnte so mehrere
-- beef_games-Zeilen fuer denselben Beef anlegen (Loadtest-Audit B3). Der Code wechselt den Status jetzt atomar;
-- der Index verhindert Dubletten auch bei kuenftigen Fehlern.
CREATE UNIQUE INDEX IF NOT EXISTS uq_beef_games_beef ON beef_games (beef_id);
