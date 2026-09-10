-- Add support_request type for anonymous contact-support tickets
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'support_request';

-- Allow tickets without a user account (anonymous support requests have no user_id)
ALTER TABLE admin_tickets ALTER COLUMN user_id DROP NOT NULL;

-- Track the entry point so admins can filter by origin
ALTER TABLE admin_tickets ADD COLUMN IF NOT EXISTS source TEXT;
