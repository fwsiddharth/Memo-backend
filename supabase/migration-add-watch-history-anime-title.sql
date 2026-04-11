-- Migration: Add anime_title column to watch_history table
-- Date: 2026-04-11
-- Purpose: Store anime title in watch_history for display without additional API calls

-- Add anime_title column to watch_history table
ALTER TABLE watch_history 
ADD COLUMN IF NOT EXISTS anime_title TEXT;

-- Add index for faster queries by anime title
CREATE INDEX IF NOT EXISTS idx_watch_history_anime_title ON watch_history(anime_title);

-- Note: This column is optional and will be backfilled gradually as users watch episodes
-- Old records without anime_title will fetch it from AniList API on-demand
