-- Restore foreign key constraints to audit_logs (revert migration 029)

-- Add back foreign key constraints with SET NULL
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
