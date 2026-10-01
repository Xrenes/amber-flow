-- Amber Flow — allow 'uncertain' show_status on appointments
--
-- The show_status part of migration 007 never ran on the live database, so
-- its check constraint still only allowed 'showed'/'no_show'. Ticking an
-- appointment done on Home completes it with show_status 'uncertain', which
-- the old constraint rejected ("violates check constraint
-- appointments_show_status_check"), so completions never saved.

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_show_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_show_status_check CHECK (show_status IN ('showed', 'no_show', 'uncertain'));
