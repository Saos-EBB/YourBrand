-- FK-Spalten ohne Index: 39 Faelle aus dem Audit 2026-10-27.
-- Hintergrund: PostgreSQL prueft FK-Constraints nicht per Index; fehlende Indexes machen
-- sich erst bei ON DELETE/UPDATE auf die referenzierte Tabelle bemerkbar (Sequential Scan
-- ueber die referenzierende Tabelle fuer jede betroffene Zeile). Im Lasttest sichtbar bei
-- DELETE FROM media_uploads (150k Zeilen, 4 FK ohne Index → >2 min statt Sekunden).
-- Alle Befehle idempotent (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_badges_beef_id                   ON badges                   (beef_id);
CREATE INDEX IF NOT EXISTS idx_badges_user_id                   ON badges                   (user_id);
CREATE INDEX IF NOT EXISTS idx_beef_comments_beef_id            ON beef_comments             (beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_comments_user_id            ON beef_comments             (user_id);
CREATE INDEX IF NOT EXISTS idx_beef_games_winner_id             ON beef_games                (winner_id);
CREATE INDEX IF NOT EXISTS idx_beef_votes_voter_id              ON beef_votes                (voter_id);
CREATE INDEX IF NOT EXISTS idx_beefs_initiator_id               ON beefs                     (initiator_id);
CREATE INDEX IF NOT EXISTS idx_beefs_target_id                  ON beefs                     (target_id);
CREATE INDEX IF NOT EXISTS idx_beefs_winner_id                  ON beefs                     (winner_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_beef_id        ON coin_transactions         (beef_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id        ON coin_transactions         (user_id);
CREATE INDEX IF NOT EXISTS idx_consent_logs_agb_version_id      ON consent_logs              (agb_version_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_request_id ON conversations             (contact_request_id);
CREATE INDEX IF NOT EXISTS idx_managed_accounts_caretaker_id    ON managed_accounts          (caretaker_id);
CREATE INDEX IF NOT EXISTS idx_managed_accounts_consent_log_id  ON managed_accounts          (consent_log_id);
CREATE INDEX IF NOT EXISTS idx_matches_conversation_id          ON matches                   (conversation_id);
CREATE INDEX IF NOT EXISTS idx_media_uploads_reviewed_by        ON media_uploads             (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_messages_flagged_by              ON messages                  (flagged_by);
CREATE INDEX IF NOT EXISTS idx_messages_media_id                ON messages                  (media_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id              ON org_members               (user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_logo_id            ON organizations             (logo_id);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id      ON organizations             (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_subscription_id     ON payment_logs              (subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id             ON payment_logs              (user_id);
CREATE INDEX IF NOT EXISTS idx_profanity_words_added_by         ON profanity_words           (added_by);
CREATE INDEX IF NOT EXISTS idx_profile_sensitive_consent_id     ON profile_sensitive_data    (consent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_audio_id                ON profiles                  (audio_id);
CREATE INDEX IF NOT EXISTS idx_profiles_photo_id                ON profiles                  (photo_id);
CREATE INDEX IF NOT EXISTS idx_reports_message_id               ON reports                   (message_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id              ON reports                   (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reviewed_by              ON reports                   (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_strikes_issued_by                ON strikes                   (issued_by);
CREATE INDEX IF NOT EXISTS idx_strikes_report_id                ON strikes                   (report_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by       ON system_settings           (updated_by);
CREATE INDEX IF NOT EXISTS idx_teeth_beef_id                    ON teeth                     (beef_id);
CREATE INDEX IF NOT EXISTS idx_teeth_from_user_id               ON teeth                     (from_user_id);
CREATE INDEX IF NOT EXISTS idx_teeth_owner_id                   ON teeth                     (owner_id);
CREATE INDEX IF NOT EXISTS idx_tooth_chains_user_id             ON tooth_chains              (user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_interest_id       ON user_interests            (interest_id);
