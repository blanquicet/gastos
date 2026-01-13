-- Add receiver_account_id to movements table
-- This is needed for DEBT_PAYMENT movements where the receiver (counterparty)
-- is a household member and we need to track which account receives the payment (income)

ALTER TABLE movements 
ADD COLUMN receiver_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;

-- Add index for the new column
CREATE INDEX idx_movements_receiver_account 
ON movements(receiver_account_id) 
WHERE receiver_account_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN movements.receiver_account_id IS 
'Account where the receiver (counterparty) receives the payment. Used for DEBT_PAYMENT when counterparty is a household member. This represents income for the receiver.';

