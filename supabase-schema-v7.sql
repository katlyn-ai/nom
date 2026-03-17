-- v7: store recipe instructions in meal_plans so AI is not called for manual recipes
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS instructions text[];
