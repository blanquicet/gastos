-- Drop indexes
DROP INDEX IF EXISTS idx_movements_payment_method;
DROP INDEX IF EXISTS idx_movements_counterparty_contact;
DROP INDEX IF EXISTS idx_movements_counterparty_user;
DROP INDEX IF EXISTS idx_movements_payer_contact;
DROP INDEX IF EXISTS idx_movements_payer_user;
DROP INDEX IF EXISTS idx_movements_household_type;
DROP INDEX IF EXISTS idx_movements_household_date;
DROP INDEX IF EXISTS idx_movements_date;
DROP INDEX IF EXISTS idx_movements_type;
DROP INDEX IF EXISTS idx_movements_household;

-- Drop table
DROP TABLE IF EXISTS movements;

-- Drop enum
DROP TYPE IF EXISTS movement_type;
