-- Add name column to users table (required field)

-- Step 1: Add column with temporary DEFAULT for existing users
-- The DEFAULT '' allows existing rows to automatically get a value
-- Without this, the migration would fail if there are already users in the table
ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT '';

-- Step 2: Remove the DEFAULT to force future inserts to provide the name explicitly
-- The column remains NOT NULL, but now without a default value
ALTER TABLE users ALTER COLUMN name DROP DEFAULT;
