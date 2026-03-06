-- NOM Schema Update v3 — Run this in Supabase SQL Editor

-- Add meal planning columns to settings table
alter table settings
  add column if not exists plan_breakfast boolean default true,
  add column if not exists plan_lunch boolean default true,
  add column if not exists plan_dinner boolean default true,
  add column if not exists vegetarian_meals_per_week int default 0,
  add column if not exists snacks text default '';

-- Add per-person dietary preferences to people_profiles
alter table people_profiles
  add column if not exists dietary_preferences text[] default '{}';
