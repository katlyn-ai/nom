-- NOM Schema v4
-- Run this in your Supabase SQL Editor
-- Adds: preferred_brands, store_sort_preference to settings
--       user_calendar_tokens table for Google Calendar sync

-- ─────────────────────────────────────────────
-- 1. Add new columns to settings table
-- ─────────────────────────────────────────────

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS preferred_brands text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS store_sort_preference text DEFAULT 'popular';

-- ─────────────────────────────────────────────
-- 2. Create user_calendar_tokens table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_calendar_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own tokens
CREATE POLICY "Users can manage own calendar tokens"
  ON user_calendar_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 3. Add updated_at trigger for calendar tokens
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_calendar_tokens_updated_at ON user_calendar_tokens;
CREATE TRIGGER update_user_calendar_tokens_updated_at
  BEFORE UPDATE ON user_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
