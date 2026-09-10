-- 014_strikes_report_id_nullable.sql
-- Macht strikes.report_id nullable: Admins können Strikes auch manuell
-- (ohne zugrundeliegenden Report) vergeben.

ALTER TABLE strikes ALTER COLUMN report_id DROP NOT NULL;
