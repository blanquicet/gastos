-- Drop password_resets table
DROP INDEX IF EXISTS idx_password_resets_expires_at;
DROP INDEX IF EXISTS idx_password_resets_token_hash;
DROP INDEX IF EXISTS idx_password_resets_user_id;
DROP TABLE IF EXISTS password_resets;
