-- 038_conversations_optional_contact_request.sql
-- Conversations created via mutual match have no contact_request — make the FK nullable.

ALTER TABLE conversations ALTER COLUMN contact_request_id DROP NOT NULL;
