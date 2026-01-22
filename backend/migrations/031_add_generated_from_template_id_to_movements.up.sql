-- Migration 032: Add generated_from_template_id to movements table
-- Links auto-generated movements back to their template

ALTER TABLE movements 
ADD COLUMN generated_from_template_id UUID REFERENCES recurring_movement_templates(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX idx_movements_template ON movements(generated_from_template_id) WHERE generated_from_template_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN movements.generated_from_template_id IS 'If this movement was auto-generated from a recurring template, stores the template ID. Used for "edit all instances" functionality.';
