-- ============================================
-- Migration: Add anime_cover to watch_history
-- ============================================
-- This migration adds the anime_cover column to the watch_history table
-- so that anime covers are stored in the database (like favorites)
-- and don't need to be fetched from AniList API every time.
-- ============================================

-- Add anime_cover column to watch_history table
ALTER TABLE public.watch_history 
ADD COLUMN IF NOT EXISTS anime_cover TEXT;

-- Add comment to document the column
COMMENT ON COLUMN public.watch_history.anime_cover IS 'Anime cover image URL (stored for display without additional API calls)';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- After running this migration:
-- 1. Restart your backend server
-- 2. Watch any episode - the cover will be saved automatically
-- 3. Old entries without covers will show placeholder until you watch them again
-- ============================================
