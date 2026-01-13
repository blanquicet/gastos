-- Drop receiver_account_id column from movements table

DROP INDEX IF EXISTS idx_movements_receiver_account;

ALTER TABLE movements 
DROP COLUMN IF EXISTS receiver_account_id;
