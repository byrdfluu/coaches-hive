-- Migration: add shipping address fields to profiles
-- Used for merch and physical deliveries. Never shown publicly.
-- Run this in the Supabase SQL editor before deploying.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shipping_address_line1 text,
  ADD COLUMN IF NOT EXISTS shipping_city           text,
  ADD COLUMN IF NOT EXISTS shipping_state          text,
  ADD COLUMN IF NOT EXISTS shipping_zip            text,
  ADD COLUMN IF NOT EXISTS shipping_country        text;