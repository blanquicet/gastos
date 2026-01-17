-- Change ip_address from INET to TEXT for easier handling in application code
ALTER TABLE audit_logs ALTER COLUMN ip_address TYPE TEXT;
