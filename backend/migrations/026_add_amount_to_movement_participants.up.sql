-- Add amount column to movement_participants to store exact values
-- This allows storing precise amounts when users enter values instead of percentages
-- Avoiding precision loss from percentage calculations

ALTER TABLE movement_participants 
ADD COLUMN amount DECIMAL(15, 2) NULL;

-- Add check constraint: amount must be positive if provided
ALTER TABLE movement_participants 
ADD CONSTRAINT movement_participants_amount_check 
CHECK (amount IS NULL OR amount > 0);

-- Comment on column
COMMENT ON COLUMN movement_participants.amount IS 'Exact amount for this participant (optional). When set, this is the source of truth instead of calculated from percentage. Mutually informative with percentage.';
