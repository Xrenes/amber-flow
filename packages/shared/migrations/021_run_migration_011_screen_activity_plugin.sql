-- Amber Flow — migration 011 never actually ran against the live database
--
-- A full schema audit (2026-09-30, via the Supabase MCP connection) found
-- that migrations 011, 012, and 014 were never applied to the live
-- database despite being tracked as run. This re-applies 011's content
-- (adds the 'screen-activity' Plugin Store entry) — idempotent, safe to
-- run again if it somehow already applied.
INSERT INTO public.plugins (id, name, description) VALUES
  ('screen-activity', 'Phone Screen Activity', 'While a Tracker session is running, logs when an agent''s phone screen turns on/off (Android) or the app is backgrounded (iOS — a rough signal only).')
ON CONFLICT (id) DO NOTHING;
