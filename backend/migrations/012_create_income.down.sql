-- Drop indexes
DROP INDEX IF EXISTS idx_income_household_date;
DROP INDEX IF EXISTS idx_income_date;
DROP INDEX IF EXISTS idx_income_account;
DROP INDEX IF EXISTS idx_income_member;
DROP INDEX IF EXISTS idx_income_household;

-- Drop income table
DROP TABLE IF EXISTS income;
