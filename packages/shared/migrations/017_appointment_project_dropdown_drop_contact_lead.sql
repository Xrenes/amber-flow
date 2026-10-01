-- Amber Flow — Project/Client Name becomes a dropdown field; drop Contact
-- Name + Lead Status from Appointments entirely
--
-- Project / Client Name on the New/Edit Appointment form is now an
-- admin-managed dropdown (like Account and Campaign) instead of free text,
-- sourced from task_field_options/task_field_config with field='project'.
-- Those two tables' CHECK constraints only allowed 'account'/'campaign', so
-- they're widened here to include 'project'.
--
-- Contact Name and Lead Status were removed from Appointments entirely (no
-- replacement) per explicit request — this drops both columns. Irreversible:
-- any existing contact_name/lead_status data on appointments is permanently
-- deleted.

ALTER TABLE public.task_field_options DROP CONSTRAINT IF EXISTS task_field_options_field_check;
ALTER TABLE public.task_field_options ADD CONSTRAINT task_field_options_field_check
  CHECK (field IN ('account', 'campaign', 'project'));

ALTER TABLE public.task_field_config DROP CONSTRAINT IF EXISTS task_field_config_field_check;
ALTER TABLE public.task_field_config ADD CONSTRAINT task_field_config_field_check
  CHECK (field IN ('account', 'campaign', 'project'));

INSERT INTO public.task_field_config (field, mode) VALUES
  ('project', 'dropdown')
ON CONFLICT (field) DO NOTHING;

ALTER TABLE public.appointments DROP COLUMN IF EXISTS contact_name;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS lead_status;
