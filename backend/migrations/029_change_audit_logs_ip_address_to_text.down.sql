-- Revert ip_address back to INET type
ALTER TABLE audit_logs ALTER COLUMN ip_address TYPE INET USING ip_address::INET;
