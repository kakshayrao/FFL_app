-- Add username/password fields to accounts
ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS username text UNIQUE,
ADD COLUMN IF NOT EXISTS password text; -- plaintext per request

-- Optional: prefill usernames for existing users (example strategy; adjust as needed)
-- 1) Try unique first name if not taken
UPDATE public.accounts a
SET username = lower(a.first_name)
WHERE a.username IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts b
    WHERE lower(b.first_name) = lower(a.first_name)
      AND b.id <> a.id
  );

-- 2) For duplicates, append last name (or other identifier)
UPDATE public.accounts a
SET username = lower(a.first_name || '_' || coalesce(a.last_name, 'x'))
WHERE a.username IS NULL;

-- Passwords can be set/edited directly in Supabase now.
-- Example:
-- UPDATE public.accounts SET password = 'TempPass123' WHERE id = '<uuid>';

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_accounts_username ON public.accounts (username);
