-- ============================================
-- PLAYER SNAPSHOTS MIGRATION
-- ============================================
-- This migration creates the player_snapshots table required for
-- player value/RAP charts. Run this SQL in your Supabase SQL Editor.
--
-- How snapshots work:
-- - A new snapshot is created once per day at midnight
-- - Today's snapshot is updated every 5 minutes with current values
-- - Each player has one snapshot per day (unique constraint)
-- ============================================

-- Create player snapshots table for daily value/rap tracking
CREATE TABLE IF NOT EXISTS player_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_value BIGINT NOT NULL DEFAULT 0,
  total_rap BIGINT NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_player_snapshots_user ON player_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_player_snapshots_date ON player_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_snapshots_user_date ON player_snapshots(user_id, snapshot_date DESC);

