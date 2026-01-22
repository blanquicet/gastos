-- Migration 033: Create recurring_movement_participants table
-- Stores participant percentages for SPLIT type recurring movement templates

CREATE TABLE recurring_movement_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES recurring_movement_templates(id) ON DELETE CASCADE,
    
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
    
    -- Prevent duplicate participants
    UNIQUE(template_id, participant_user_id),
    UNIQUE(template_id, participant_contact_id)
);

-- Indexes
CREATE INDEX idx_recurring_participants_template ON recurring_movement_participants(template_id);
CREATE INDEX idx_recurring_participants_user ON recurring_movement_participants(participant_user_id) WHERE participant_user_id IS NOT NULL;
CREATE INDEX idx_recurring_participants_contact ON recurring_movement_participants(participant_contact_id) WHERE participant_contact_id IS NOT NULL;

-- Comment
COMMENT ON TABLE recurring_movement_participants IS 'Participant percentages for SPLIT type recurring movement templates. When template generates movement, creates corresponding movement_participants entries.';
