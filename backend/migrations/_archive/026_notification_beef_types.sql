-- 026_notification_beef_types.sql
-- Fügt Beef-spezifische Notification-Typen hinzu: beef_request, beef_accepted,
-- beef_won, beef_lost — für In-App-Benachrichtigungen rund um Herausforderungen.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'beef_request';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'beef_accepted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'beef_won';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'beef_lost';
