-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Account / Campaign / Agent fields on tasks
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after schema.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- New task fields:
--   agent_name    — always the real name of whoever created the task (auto-filled)
--   account_name  — free text or picked from task_field_options (field='account')
--   campaign_name — free text or picked from task_field_options (field='campaign')
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS agent_name    TEXT,
  ADD COLUMN IF NOT EXISTS account_name  TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT;

-- ── Admin-managed dropdown options for Account / Campaign ──────────────────
-- Starts empty; admin adds values from the Admin Panel. Everyone can read
-- (needed to populate the dropdown), only admin/manager can write.
CREATE TABLE IF NOT EXISTS public.task_field_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field      TEXT NOT NULL CHECK (field IN ('account', 'campaign')),
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (field, value)
);

ALTER TABLE public.task_field_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_field_options_read_all" ON public.task_field_options;
CREATE POLICY "task_field_options_read_all" ON public.task_field_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "task_field_options_admin_write" ON public.task_field_options;
CREATE POLICY "task_field_options_admin_write" ON public.task_field_options
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- ── Per-field input mode: 'dropdown' (pick from task_field_options) or
--    'text' (free-typed). Admin toggles this per field from the Admin Panel.
CREATE TABLE IF NOT EXISTS public.task_field_config (
  field TEXT PRIMARY KEY CHECK (field IN ('account', 'campaign')),
  mode  TEXT NOT NULL DEFAULT 'dropdown' CHECK (mode IN ('dropdown', 'text'))
);

INSERT INTO public.task_field_config (field, mode) VALUES
  ('account', 'dropdown'),
  ('campaign', 'dropdown')
ON CONFLICT (field) DO NOTHING;

ALTER TABLE public.task_field_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_field_config_read_all" ON public.task_field_config;
CREATE POLICY "task_field_config_read_all" ON public.task_field_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "task_field_config_admin_write" ON public.task_field_config;
CREATE POLICY "task_field_config_admin_write" ON public.task_field_config
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));
