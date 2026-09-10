-- Migration 019: Add 'owner' role
-- Run once. The partial unique index enforces a maximum of one owner at any time.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner';

-- Enforce max-1 owner constraint via partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON users ((role)) WHERE role = 'owner';
