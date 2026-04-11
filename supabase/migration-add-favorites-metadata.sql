-- Migration: Add anime_title and anime_cover columns to favorites table
-- Date: 2026-04-11

ALTER TABLE favorites 
ADD COLUMN IF NOT EXISTS anime_title TEXT,
ADD COLUMN IF NOT EXISTS anime_cover TEXT;

-- Note: added_at should remain as BIGINT (milliseconds timestamp)
-- If it was changed to timestamp, revert it:
-- ALTER TABLE favorites ALTER COLUMN added_at TYPE BIGINT USING EXTRACT(EPOCH FROM added_at::timestamp) * 1000;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_anime_id ON favorites(anime_id);
