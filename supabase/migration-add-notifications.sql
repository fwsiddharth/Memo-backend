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

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_enabled 
ON notifications (user_id, enabled);

CREATE INDEX IF NOT EXISTS idx_notifications_updated_at 
ON notifications (updated_at);