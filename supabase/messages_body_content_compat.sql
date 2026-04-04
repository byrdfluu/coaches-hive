-- Ensure both body and content columns exist so SELECT queries work
-- regardless of which column name the original schema used.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS body text;

-- Sync existing data between columns so old messages appear correctly.
UPDATE public.messages SET content = body WHERE content IS NULL AND body IS NOT NULL;
UPDATE public.messages SET body = content WHERE body IS NULL AND content IS NOT NULL;
