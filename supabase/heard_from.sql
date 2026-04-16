-- Migration: add heard_from column to profiles for onboarding attribution
-- Run this in the Supabase SQL editor before deploying.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS heard_from text;