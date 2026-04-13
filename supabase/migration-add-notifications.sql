-- Migration: Add notifications table for episode notifications
-- This table stores user notification preferences for anime

CREATE TABLE IF NOT EXISTS notifications (
    user_id TEXT NOT NULL,
    anime_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'anilist',
    anime_title TEXT,
    anime_cover TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, anime_id, provider)
);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (auth.uid()::text = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_enabled 
ON notifications (user_id, enabled);

CREATE INDEX IF NOT EXISTS idx_notifications_updated_at 
ON notifications (updated_at);