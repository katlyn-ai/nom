-- NOM Schema v6
-- Run this in your Supabase SQL Editor
-- Adds: expires_at to pantry_items (optional date field)

ALTER TABLE pantry_items
  ADD COLUMN IF NOT EXISTS expires_at date;
