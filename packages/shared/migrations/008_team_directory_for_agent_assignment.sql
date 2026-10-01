-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Team directory read access (for the Appointment "Agent" dropdown)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 000_*.sql)
--
-- Any signed-in agent can now read every profile's id/name/role (not just
-- their own), so the Appointment modal's Agent field can offer a dropdown of
-- teammates to assign/reassign an appointment to — not just admin/manager.
-- This is in addition to (not instead of) profiles_manager_view, which still
-- grants admin/manager full-row access for everything else in the Admin Panel.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "profiles_team_directory_read" ON public.profiles;
CREATE POLICY "profiles_team_directory_read" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── Allow reassigning an appointment to a different agent ──────────────────
-- appt_own was a single FOR ALL USING (user_id = auth.uid()) policy. With no
-- explicit WITH CHECK, Postgres reuses USING for writes too — blocking any
-- update that changes user_id away from the caller, so reassignment couldn't
-- work at all. Splitting into per-command policies below fixes that narrowly:
-- only UPDATE gets a relaxed check, and even then the new user_id must be a
-- real row in profiles (a genuine teammate) — not true, which would accept
-- any caller-supplied UUID (or, combined with FOR ALL, loosen INSERT/DELETE
-- checks too).
DROP POLICY IF EXISTS "appt_own" ON public.appointments;

CREATE POLICY "appt_select_own" ON public.appointments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "appt_insert_own" ON public.appointments
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Must currently own the row; may reassign only to an id that exists in
-- profiles (a real teammate), or keep it as-is.
CREATE POLICY "appt_update_own_or_reassign" ON public.appointments
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id));

CREATE POLICY "appt_delete_own" ON public.appointments
  FOR DELETE USING (user_id = auth.uid());
