-- Fix audit_logs foreign key constraints to preserve audit history
-- Change from ON DELETE CASCADE to ON DELETE SET NULL so audit logs are preserved
-- even after households/users are deleted

-- Drop existing constraints
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_household_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- Recreate with ON DELETE SET NULL to preserve audit history
ALTER TABLE audit_logs 
  ADD CONSTRAINT audit_logs_household_id_fkey 
  FOREIGN KEY (household_id) 
  REFERENCES households(id) 
  ON DELETE SET NULL;

ALTER TABLE audit_logs 
  ADD CONSTRAINT audit_logs_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

-- Add comment explaining the reasoning
COMMENT ON CONSTRAINT audit_logs_household_id_fkey ON audit_logs IS 
  'Foreign key with ON DELETE SET NULL to preserve audit history after household deletion';

COMMENT ON CONSTRAINT audit_logs_user_id_fkey ON audit_logs IS 
  'Foreign key with ON DELETE SET NULL to preserve audit history after user deletion';
