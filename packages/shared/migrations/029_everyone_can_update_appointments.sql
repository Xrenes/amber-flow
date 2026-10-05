-- Amber Flow — same office: any signed-in user can change any appointment's
-- status/outcome (Reports → Appointments status dropdown). Deleting is still
-- limited to the row's saver or an admin/manager.
DROP POLICY IF EXISTS "appt_update_own_or_manager" ON public.appointments;
DROP POLICY IF EXISTS "appt_update_team" ON public.appointments;
CREATE POLICY "appt_update_team" ON public.appointments
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id));
