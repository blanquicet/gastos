-- Add account_id column to payment_methods for optional linking
ALTER TABLE payment_methods
ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Create index for account linking
CREATE INDEX idx_payment_methods_account ON payment_methods(account_id);
