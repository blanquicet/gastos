-- Drop indexes
DROP INDEX IF EXISTS idx_accounts_household_type;
DROP INDEX IF EXISTS idx_accounts_type;
DROP INDEX IF EXISTS idx_accounts_household;

-- Drop accounts table
DROP TABLE IF EXISTS accounts;

-- Drop account_type enum
DROP TYPE IF EXISTS account_type;
