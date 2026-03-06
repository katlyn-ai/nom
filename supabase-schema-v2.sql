-- NOM Schema Update v2 — Run this in Supabase SQL Editor

-- Add new columns to settings table
alter table settings
  add column if not exists onboarding_completed boolean default false,
  add column if not exists breakfast_style text default '',
  add column if not exists lunch_style text default '',
  add column if not exists dinner_style text default '';

-- People profiles table
create table if not exists people_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  age_group text default 'Adult (18+)',
  dislikes text[] default '{}',
  allergies text[] default '{}',
  created_at timestamptz default now()
);

alter table people_profiles enable row level security;

create policy "Users can manage their own people profiles"
  on people_profiles for all using (auth.uid() = user_id);
