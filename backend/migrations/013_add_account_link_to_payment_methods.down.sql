-- Drop index
DROP INDEX IF EXISTS idx_payment_methods_account;

-- Remove account_id column from payment_methods
ALTER TABLE payment_methods
DROP COLUMN IF EXISTS account_id;
