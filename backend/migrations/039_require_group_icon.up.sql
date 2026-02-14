-- Set default icon for groups without one
UPDATE category_groups SET icon = '📦' WHERE icon IS NULL OR icon = '';

-- Make icon NOT NULL
ALTER TABLE category_groups ALTER COLUMN icon SET NOT NULL;
ALTER TABLE category_groups ALTER COLUMN icon SET DEFAULT '📦';
ALTER TABLE category_groups ADD CONSTRAINT category_groups_icon_not_empty CHECK (icon != '');
