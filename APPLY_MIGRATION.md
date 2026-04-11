# Apply Database Migration

## Issue
The app is showing "Internal server error" when saving watch progress because the `anime_title` column is missing from the `watch_history` table.

## Solution
Run the migration to add the `anime_title` column.

## Steps

### Option 1: Run Migration File (Recommended)
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Go to your project
3. Click "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy and paste the contents of `supabase/migration-add-watch-history-anime-title.sql`
6. Click "Run" or press Ctrl+Enter
7. Verify success message appears

### Option 2: Run Complete Schema (Fresh Install)
If you want to recreate all tables from scratch:
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `supabase/schema-complete.sql`
4. Click "Run"
5. This will drop and recreate all tables (⚠️ WARNING: This deletes all existing data!)

## Verification
After running the migration, restart your backend server and test:
1. Play an episode
2. Pause or seek
3. Check logs - should see "✅ [PROGRESS] Progress saved successfully" instead of errors

## What This Migration Does
- Adds `anime_title` column to `watch_history` table
- Creates an index for faster queries
- Allows the app to store anime titles alongside watch progress
- Reduces API calls by caching anime titles in the database
