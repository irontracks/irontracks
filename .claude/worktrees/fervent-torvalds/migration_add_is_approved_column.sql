-- Migration: Add is_approved column to profiles table
-- Date: 2026-02-08
-- Description: Adds is_approved column (default false) and backfills existing users to true.

-- 1. Add the column with default value false
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- 2. Update all existing profiles to be approved (backfill)
-- This ensures that current users don't lose access
UPDATE profiles 
SET is_approved = true;

-- 3. (Optional) Verify the update
-- SELECT id, email, is_approved FROM profiles LIMIT 10;
