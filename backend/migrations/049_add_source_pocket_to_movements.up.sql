ALTER TABLE movements ADD COLUMN source_pocket_id UUID REFERENCES pockets(id) ON DELETE SET NULL;
CREATE INDEX idx_movements_source_pocket ON movements(source_pocket_id) WHERE source_pocket_id IS NOT NULL;
