-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Sync profiles.username for existing team accounts
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 000_*.sql)
--
-- Every account created via the Worker's /setup-team-accounts (from the
-- INTERNAL_USERS secret) already has auth.users.raw_user_meta_data->>'name'
-- set (e.g. "Richard", "Mason", "Sam"). This sets profiles.username to the
-- lowercased version of that name for every profile that doesn't have a
-- username yet, so the new /username-login (desktop app Sign In) works for
-- accounts that were previously only reachable via /internal-login (legacy
-- web app's "Team" tab).
--
-- Safe to re-run: only fills NULL usernames, never overwrites one already set.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.profiles p
SET username = lower(regexp_replace(u.raw_user_meta_data->>'name', '\s+', '', 'g'))
FROM auth.users u
WHERE u.id = p.id
  AND p.username IS NULL
  AND u.raw_user_meta_data->>'name' IS NOT NULL
  AND u.raw_user_meta_data->>'name' <> '';

-- Show the result so you can confirm who now has a username.
SELECT p.id, u.email, p.name, p.role, p.username
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ORDER BY p.username NULLS LAST;
