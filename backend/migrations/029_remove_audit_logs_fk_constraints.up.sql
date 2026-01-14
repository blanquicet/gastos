-- Remove foreign key constraints from audit_logs to make it fully independent
-- Audit logs should preserve ALL historical data regardless of resource deletion
-- Store IDs as plain UUIDs without referential integrity constraints

-- Drop foreign key constraints
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_household_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- Add comments to document that these are historical references
COMMENT ON COLUMN audit_logs.household_id IS 
  'Historical reference to household - no FK constraint to preserve audit history after deletion';

COMMENT ON COLUMN audit_logs.user_id IS 
  'Historical reference to user - no FK constraint to preserve audit history after deletion';

COMMENT ON TABLE audit_logs IS 
  'Audit log table with no foreign key constraints to ensure complete historical preservation';
