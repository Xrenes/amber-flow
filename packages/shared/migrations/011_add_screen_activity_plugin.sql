-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Add "Phone Screen Activity" to the Plugin Store
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 010_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Mobile-only plugin: while an agent's Tracker session is running, logs
-- screen-on/off transitions (Android, via a real ACTION_SCREEN_ON/OFF
-- listener) or app-foreground/background transitions (iOS, via AppState —
-- a rough substitute, since Apple blocks true screen-state detection for
-- third-party apps). Defaults OFF like every other plugin, admin/manager
-- opt in from the Plugin Store tab, same as Idle/Active Status.
INSERT INTO public.plugins (id, name, description) VALUES
  ('screen-activity', 'Phone Screen Activity', 'While a Tracker session is running, logs when an agent''s phone screen turns on/off (Android) or the app is backgrounded (iOS — a rough signal only).')
ON CONFLICT (id) DO NOTHING;
