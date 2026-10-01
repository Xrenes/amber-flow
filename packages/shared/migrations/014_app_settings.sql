-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — App Settings (generic key/value config) + tracking sheet URL
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 013_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Small generic key/value store for single-value admin config that doesn't
-- warrant its own table — starts with the external Google Sheet link admin
-- wants to open from the app (see "Open Tracking Sheet" in the Admin Panel),
-- reusable for any future one-off setting.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Every signed-in user can read settings (e.g. so any agent could see the
-- sheet link too, not just admin/manager, if ever exposed there).
DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
CREATE POLICY "app_settings_read_all" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- Seed the tracking sheet URL from the DialForce sheet shared during setup —
-- admin can change it later from the Admin Panel without a code change.
INSERT INTO public.app_settings (key, value)
VALUES ('tracking_sheet_url', 'https://docs.google.com/spreadsheets/d/1i8AjI3ZgQZ55ROZ_rRIssaSXzZtljYT0zN3R9icsmMQ/edit')
ON CONFLICT (key) DO NOTHING;
