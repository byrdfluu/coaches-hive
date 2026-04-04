-- Add tags array to profiles for org contact tagging
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
