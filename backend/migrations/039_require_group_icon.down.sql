ALTER TABLE category_groups DROP CONSTRAINT IF EXISTS category_groups_icon_not_empty;
ALTER TABLE category_groups ALTER COLUMN icon DROP DEFAULT;
ALTER TABLE category_groups ALTER COLUMN icon DROP NOT NULL;
