-- NOM Database Schema
-- Run this in your Supabase SQL editor (Database > SQL Editor > New query)

-- Settings table
create table if not exists settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  household_size int default 2,
  dietary_preferences text[] default '{}',
  pantry_enabled boolean default true,
  currency text default '€',
  preferred_store text default '',
  order_day text default 'Sunday',
  calorie_target int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Recipes table
create table if not exists recipes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  ingredients text[] default '{}',
  instructions text,
  rating int check (rating between 1 and 5),
  servings int default 4,
  prep_time int default 30,
  tags text[] default '{}',
  last_suggested_at timestamptz,
  created_at timestamptz default now()
);

-- Meal plans table
create table if not exists meal_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start date default current_date,
  day_index int not null check (day_index between 0 and 6),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid references recipes(id) on delete set null,
  custom_name text,
  created_at timestamptz default now()
);

-- Shopping items table
create table if not exists shopping_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text default 'Other',
  checked boolean default false,
  added_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Orders table (for spending tracking)
create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  store text,
  amount numeric(10,2),
  items jsonb,
  created_at timestamptz default now()
);

-- Pantry items table
create table if not exists pantry_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  quantity text,
  expires_at date,
  created_at timestamptz default now()
);

-- Enable Row Level Security on all tables
alter table settings enable row level security;
alter table recipes enable row level security;
alter table meal_plans enable row level security;
alter table shopping_items enable row level security;
alter table orders enable row level security;
alter table pantry_items enable row level security;

-- RLS Policies: users can only see/edit their own data
create policy "Users can manage their own settings"
  on settings for all using (auth.uid() = user_id);

create policy "Users can manage their own recipes"
  on recipes for all using (auth.uid() = user_id);

create policy "Users can manage their own meal plans"
  on meal_plans for all using (auth.uid() = user_id);

create policy "Users can manage their own shopping items"
  on shopping_items for all using (auth.uid() = user_id);

create policy "Users can manage their own orders"
  on orders for all using (auth.uid() = user_id);

create policy "Users can manage their own pantry"
  on pantry_items for all using (auth.uid() = user_id);
