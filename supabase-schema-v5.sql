-- NOM Schema v5
-- Run this in your Supabase SQL Editor
-- Adds: quantity to pantry_items and shopping_items

-- ─────────────────────────────────────────────
-- 1. Add quantity to pantry_items
--    Free-text, e.g. "ca 500g", "a handful", "2 cups"
-- ─────────────────────────────────────────────

ALTER TABLE pantry_items
  ADD COLUMN IF NOT EXISTS quantity text;

-- ─────────────────────────────────────────────
-- 2. Add quantity to shopping_items
--    AI-generated, e.g. "200g", "1 cup", "3 pieces"
-- ─────────────────────────────────────────────

ALTER TABLE shopping_items
  ADD COLUMN IF NOT EXISTS quantity text;
