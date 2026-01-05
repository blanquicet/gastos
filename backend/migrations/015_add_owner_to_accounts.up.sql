-- Add owner_id to accounts table
-- Accounts now belong to a specific household member, not the whole household

ALTER TABLE accounts
ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Create index for owner lookups
CREATE INDEX idx_accounts_owner ON accounts(owner_id);

-- Update existing accounts to have an owner
-- For now, assign to the first member of each household
UPDATE accounts a
SET owner_id = (
    SELECT user_id 
    FROM household_members hm 
    WHERE hm.household_id = a.household_id 
    ORDER BY hm.joined_at ASC 
    LIMIT 1
);

-- Make owner_id required after backfilling
ALTER TABLE accounts
ALTER COLUMN owner_id SET NOT NULL;
