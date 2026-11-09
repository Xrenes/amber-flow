-- Amber Flow — base table grants for appointments
--
-- appointments was created via the Supabase dashboard and never got an
-- explicit GRANT in migrations (missed by the 018/019 sweeps). Without it,
-- every read fails with "permission denied for table appointments" before
-- RLS is even evaluated. RLS policies (024/028/029) still decide row access.
-- Run this in: Supabase Dashboard → SQL Editor → New Query. Safe to re-run.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
