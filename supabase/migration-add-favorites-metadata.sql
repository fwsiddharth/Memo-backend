-- Migration: Add anime_title and anime_cover to favorites table
-- Date: 2026-04-12
-- Description: Adds metadata columns to favorites table to avoid extra API calls

-- Add anime_title column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'favorites' 
    AND column_name = 'anime_title'
  ) THEN
    ALTER TABLE public.favorites ADD COLUMN anime_title TEXT;
  END IF;
END $$;

-- Add anime_cover column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'favorites' 
    AND column_name = 'anime_cover'
  ) THEN
    ALTER TABLE public.favorites ADD COLUMN anime_cover TEXT;
  END IF;
END $$;

-- Verify the migration
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'favorites'
ORDER BY ordinal_position;
