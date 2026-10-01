-- Amber Flow — agent_name on time_sessions; appointments/time_sessions
-- readable by every signed-in user (Reports now shows everyone's work,
-- attributed by agent name, not scoped to "my own login").
--
-- Context: the Agent field everywhere (New Appointment, Time Tracker) is
-- now built ONLY from the admin-managed Agent list in Field Options
-- (task_field_options, field='agent') — never from team logins/display
-- names. A signed-in account is just "who is saving this row"; agent_name
-- is the separate, authoritative "who this is for" — unaffected by anyone
-- later renaming their display name.

-- 1) time_sessions gets the same agent_name column appointments already has.
ALTER TABLE public.time_sessions ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- 2) Every signed-in user can read every appointment / time session, so
-- Reports (My Reports / mobile Reports) can show everyone's work by agent
-- name. Writes stay scoped to the row's own user_id (or admin/manager),
-- unchanged from before.
DROP POLICY IF EXISTS "appt_select_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_manager_view" ON public.appointments;
DROP POLICY IF EXISTS "appt_select_all" ON public.appointments;
CREATE POLICY "appt_select_all" ON public.appointments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sessions_own" ON public.time_sessions;
DROP POLICY IF EXISTS "sessions_manager_view" ON public.time_sessions;
DROP POLICY IF EXISTS "sessions_select_all" ON public.time_sessions;
DROP POLICY IF EXISTS "sessions_write_own_or_manager" ON public.time_sessions;
CREATE POLICY "sessions_select_all" ON public.time_sessions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sessions_write_own_or_manager" ON public.time_sessions
  FOR ALL USING (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'))
  WITH CHECK (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'));

-- 3) Admin account deletion: let an admin/manager delete a profile row
-- (deleting the matching auth.users row is done via the admin-delete-user
-- Edge Function, which needs the service-role key). profiles.id cascades
-- from auth.users ON DELETE CASCADE, so this policy is really only hit if
-- an admin deletes the profile without the auth user existing anymore.
DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;
CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE USING (get_my_role() IN ('admin', 'manager'));
