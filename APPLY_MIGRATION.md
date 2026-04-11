# Apply Database Migrations

## Recent Migrations

### Migration 3: Add anime_cover to watch_history (Latest)
**File**: `supabase/migration-add-watch-history-anime-cover.sql`

**Issue**: Continue Watching and Completed sections show broken images because anime covers are not stored in the database.

**Solution**: Add `anime_cover` column to `watch_history` table so covers are stored (like favorites) and don't need API calls.

**Steps**:
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Go to your project
3. Click "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy and paste the contents of `supabase/migration-add-watch-history-anime-cover.sql`
6. Click "Run" or press Ctrl+Enter
7. Verify success message appears

**What This Does**:
- Adds `anime_cover` column to `watch_history` table
- Stores anime cover URLs alongside watch progress
- Makes Continue Watching and Completed sections work like Favorites (covers from DB)
- Old entries without covers will show placeholder until you watch them again

---

### Migration 2: Add metadata to favorites
**File**: `supabase/migration-add-favorites-metadata.sql`

**Issue**: Favorites table missing `anime_title` and `anime_cover` columns.

**Solution**: Add metadata columns to favorites table.

---

### Migration 1: Add anime_title to watch_history
**File**: `supabase/migration-add-watch-history-anime-title.sql`

**Issue**: The app was showing "Internal server error" when saving watch progress because the `anime_title` column was missing from the `watch_history` table.

**Solution**: Add `anime_title` column to `watch_history` table.

---

## Option: Run Complete Schema (Fresh Install)
If you want to recreate all tables from scratch:
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `supabase/schema-complete.sql`
4. Click "Run"
5. This will drop and recreate all tables (⚠️ WARNING: This deletes all existing data!)

## Verification
After running migrations, restart your backend server and test:
1. Play an episode
2. Pause or seek
3. Check library screen - images should load properly
4. Check logs - should see "✅ [PROGRESS] Progress saved successfully"

