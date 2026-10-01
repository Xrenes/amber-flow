-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Enable Idle/Active Status plugin by default
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 000_*.sql)
--
-- The plugins table seeds 'idle-status' with enabled=FALSE (its column
-- default). If that row was already inserted by an earlier migration run,
-- a plain INSERT ... ON CONFLICT DO NOTHING won't flip it on — this
-- explicitly turns it on for everyone.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.plugins SET enabled = true WHERE id = 'idle-status';

-- In case this runs before 000_*.sql ever inserted the row.
INSERT INTO public.plugins (id, name, description, enabled) VALUES
  ('idle-status', 'Idle/Active Status', 'Shows each agent as Active, Idle, or Away in real time, based on keyboard/mouse activity.', true)
ON CONFLICT (id) DO UPDATE SET enabled = true;
