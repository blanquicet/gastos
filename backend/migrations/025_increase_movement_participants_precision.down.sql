-- Revert precision of percentage column in movement_participants
-- From DECIMAL(10,8) back to DECIMAL(5,4)

ALTER TABLE movement_participants 
ALTER COLUMN percentage TYPE DECIMAL(5, 4);

-- Restore original comment
COMMENT ON COLUMN movement_participants.percentage IS 'Participant share as decimal (0.0 to 1.0). E.g., 0.25 = 25%';
