-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Set up Sam's test account (manager role)
-- Run this AFTER creating the auth user sam@amberflow.internal in
-- Supabase Dashboard → Authentication → Users.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.profiles (id, name, role, username)
SELECT id, 'Sam', 'manager', 'sam'
FROM auth.users
WHERE email = 'sam@amberflow.internal'
ON CONFLICT (id) DO UPDATE
SET name = 'Sam', role = 'manager', username = 'sam';
