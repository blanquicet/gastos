-- Remove owner_id from accounts table

ALTER TABLE accounts
DROP CONSTRAINT IF EXISTS accounts_owner_in_household;

DROP INDEX IF EXISTS idx_accounts_owner;

ALTER TABLE accounts
DROP COLUMN IF EXISTS owner_id;
