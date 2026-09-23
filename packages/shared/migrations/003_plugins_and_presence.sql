-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Plugin store (Idle/Active status, Productivity Reports)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 002_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Plugin registry ──────────────────────────────────────────────────────
-- One row per known plugin. `enabled` is a global on/off switch admin
-- controls from the Admin Panel's Plugin Store tab. New plugin ids are
-- seeded here (not dynamically discovered — this is a curated set of
-- built-in features presented as a "store", not a real plugin loader).
CREATE TABLE IF NOT EXISTS public.plugins (
  id          TEXT PRIMARY KEY, -- e.g. 'idle-status', 'productivity-reports'
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.plugins (id, name, description) VALUES
  ('idle-status', 'Idle/Active Status', 'Shows each agent as Active, Idle, or Away in real time, based on keyboard/mouse activity.'),
  ('productivity-reports', 'Productivity Reports', 'Per-agent, per-date-range report of hours worked, tasks completed, and appointment outcomes.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plugins_read_all" ON public.plugins;
CREATE POLICY "plugins_read_all" ON public.plugins
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "plugins_admin_write" ON public.plugins;
CREATE POLICY "plugins_admin_write" ON public.plugins
  FOR UPDATE USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- ── Presence (backs the Idle/Active Status plugin) ──────────────────────
-- One row per user, upserted periodically by that user's own client while
-- the app is open and the plugin is enabled — visible to the agent (their
-- own status shows in the topbar) and to admin/manager (Admin Panel).
CREATE TABLE IF NOT EXISTS public.presence (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'away')),
  last_active  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presence_self_write" ON public.presence;
CREATE POLICY "presence_self_write" ON public.presence
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "presence_manager_view" ON public.presence;
CREATE POLICY "presence_manager_view" ON public.presence
  FOR SELECT USING (get_my_role() IN ('admin', 'manager'));
