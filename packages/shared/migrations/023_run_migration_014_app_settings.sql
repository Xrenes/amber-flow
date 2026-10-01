-- Amber Flow — migration 014 never actually ran against the live database
--
-- Same gap as 021/022 (see 021's comment): re-applies 014's content
-- (app_settings key/value table + seeded tracking_sheet_url), with the
-- missing GRANT added explicitly this time.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
CREATE POLICY "app_settings_read_all" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;

INSERT INTO public.app_settings (key, value)
VALUES ('tracking_sheet_url', 'https://docs.google.com/spreadsheets/d/1i8AjI3ZgQZ55ROZ_rRIssaSXzZtljYT0zN3R9icsmMQ/edit')
ON CONFLICT (key) DO NOTHING;
