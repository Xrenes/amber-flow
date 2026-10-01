-- Amber Flow — let appointments be created/assigned for teammates
--
-- Migration 008 never ran on the live database, which still had the
-- original single policy: appt_own FOR ALL USING (user_id = auth.uid()).
-- The New Appointment modal's Agent dropdown lets anyone book an
-- appointment for a teammate, but that policy rejected every row whose
-- user_id wasn't the caller's own id ("new row violates row-level security
-- policy for table appointments"), so those appointments never saved and
-- never showed up in Reports or the Admin Appointments tab. 008 as written
-- also only relaxed UPDATE, so creating directly for a teammate would still
-- have failed.
--
-- New rules:
--   - read: own rows (admin/manager still see everything via appt_manager_view)
--   - create: for any real teammate (user_id must exist in profiles)
--   - update/complete/miss: own rows, or any row for admin/manager; the
--     (possibly reassigned) owner must still be a real teammate
--   - delete: own rows, or any row for admin/manager
--   - any signed-in user can read the team list, so agents' Agent dropdown
--     isn't empty

DROP POLICY IF EXISTS "profiles_team_directory_read" ON public.profiles;
CREATE POLICY "profiles_team_directory_read" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "appt_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_select_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_insert_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_update_own_or_reassign" ON public.appointments;
DROP POLICY IF EXISTS "appt_delete_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_insert_team" ON public.appointments;
DROP POLICY IF EXISTS "appt_update_own_or_manager" ON public.appointments;
DROP POLICY IF EXISTS "appt_delete_own_or_manager" ON public.appointments;

CREATE POLICY "appt_select_own" ON public.appointments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "appt_insert_team" ON public.appointments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id)
  );

CREATE POLICY "appt_update_own_or_manager" ON public.appointments
  FOR UPDATE USING (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id));

CREATE POLICY "appt_delete_own_or_manager" ON public.appointments
  FOR DELETE USING (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'));
