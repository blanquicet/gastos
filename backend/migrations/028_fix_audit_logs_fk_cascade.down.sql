-- Revert audit_logs foreign key constraints back to CASCADE

-- Drop SET NULL constraints
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_household_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- Recreate with ON DELETE CASCADE (original behavior)
ALTER TABLE audit_logs 
  ADD CONSTRAINT audit_logs_household_id_fkey 
  FOREIGN KEY (household_id) 
  REFERENCES households(id) 
  ON DELETE CASCADE;

ALTER TABLE audit_logs 
  ADD CONSTRAINT audit_logs_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;
