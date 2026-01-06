-- Create movement_participants table (for COMPARTIDO movements)
CREATE TABLE movement_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_id UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    
    -- Participant (user or contact - exactly one required)
    participant_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    participant_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        (participant_user_id IS NOT NULL AND participant_contact_id IS NULL) OR 
        (participant_user_id IS NULL AND participant_contact_id IS NOT NULL)
    ),
    
    -- Percentage (0.0 to 1.0, e.g., 0.25 = 25%)
    percentage DECIMAL(5, 4) NOT NULL CHECK (percentage > 0 AND percentage <= 1),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate participants in same movement
    -- (Only one constraint needed since user_id and contact_id are mutually exclusive)
    UNIQUE(movement_id, participant_user_id),
    UNIQUE(movement_id, participant_contact_id)
);

-- Indexes for performance
CREATE INDEX idx_movement_participants_movement ON movement_participants(movement_id);
CREATE INDEX idx_movement_participants_user ON movement_participants(participant_user_id) WHERE participant_user_id IS NOT NULL;
CREATE INDEX idx_movement_participants_contact ON movement_participants(participant_contact_id) WHERE participant_contact_id IS NOT NULL;

-- Comment on table
COMMENT ON TABLE movement_participants IS 'Stores participants for SPLIT (shared/split) movements with their percentage share';
COMMENT ON COLUMN movement_participants.percentage IS 'Participant share as decimal (0.0 to 1.0). E.g., 0.25 = 25%';
COMMENT ON COLUMN movement_participants.participant_user_id IS 'Participant when they are a household member. Mutually exclusive with participant_contact_id';
COMMENT ON COLUMN movement_participants.participant_contact_id IS 'Participant when they are an external contact. Mutually exclusive with participant_user_id';
