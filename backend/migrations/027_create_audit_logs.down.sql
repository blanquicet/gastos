-- Drop indexes
DROP INDEX IF EXISTS idx_audit_logs_household_time;
DROP INDEX IF EXISTS idx_audit_logs_user_time;
DROP INDEX IF EXISTS idx_audit_logs_household_action;
DROP INDEX IF EXISTS idx_audit_logs_user_action;
DROP INDEX IF EXISTS idx_audit_logs_resource;
DROP INDEX IF EXISTS idx_audit_logs_action;
DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS idx_audit_logs_household;
DROP INDEX IF EXISTS idx_audit_logs_user;

-- Drop table
DROP TABLE IF EXISTS audit_logs;

-- Drop enum
DROP TYPE IF EXISTS audit_action;
